import type {
  Ack,
  ClientToServerEvents,
  MessageDto,
  SendMessageAck,
  SendMessageInput,
  ServerToClientEvents,
} from '@bozochat/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { conversationsKey, upsertMessageInCache } from './conversations';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Ouvre une connexion Socket.IO (même origine, cookie de session envoyé automatiquement). */
export function useSocket(enabled: boolean) {
  const [socket, setSocket] = useState<AppSocket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const s: AppSocket = io({ withCredentials: true });
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    setSocket(s);
    return () => {
      s.disconnect();
      setSocket(null);
    };
  }, [enabled]);

  return { socket, connected };
}

const ACK_TIMEOUT_MS = 10_000;

/**
 * Un ack qui n'arrive jamais (socket en pleine reconnexion) ne doit pas figer l'interface :
 * au-delà du délai on répond une erreur affichable plutôt que de laisser la promesse pendante.
 */
function withAckTimeout<T>(request: Promise<T>, onTimeout: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(onTimeout), ACK_TIMEOUT_MS);
    void request.then((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

/** Rejoint la room `conversation:<id>` ; le serveur vérifie l'appartenance et répond par un ack. */
export function joinConversation(socket: AppSocket, conversationId: string): Promise<Ack> {
  return withAckTimeout<Ack>(
    new Promise((resolve) => socket.emit('conversation:join', { conversationId }, resolve)),
    { ok: false, error: { statusCode: 0, message: 'Connexion temps réel indisponible.' } },
  );
}

export function leaveConversation(socket: AppSocket, conversationId: string): void {
  socket.emit('conversation:leave', { conversationId });
}

/** Envoi temps réel ; l'ack contient le message créé, à passer à `upsertMessageInCache`. */
export function sendMessage(socket: AppSocket, input: SendMessageInput): Promise<SendMessageAck> {
  return withAckTimeout<SendMessageAck>(
    new Promise((resolve) => socket.emit('message:send', input, resolve)),
    {
      ok: false,
      error: { statusCode: 0, message: 'Le serveur ne répond pas. Réessayez dans un instant.' },
    },
  );
}

/**
 * Maintient l'abonnement à la conversation affichée.
 * Le `join` est rejoué à chaque `connect` : les rooms Socket.IO sont perdues à la reconnexion,
 * sans quoi l'écran cesserait silencieusement de recevoir `message:new`.
 * Renvoie le message d'erreur du serveur si l'abonnement a échoué, sinon `null`.
 */
export function useConversationRoom(
  socket: AppSocket | null,
  conversationId: string | undefined,
): string | null {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!socket || !conversationId) return;
    let cancelled = false;

    const join = () => {
      void joinConversation(socket, conversationId).then((ack) => {
        if (!cancelled) setError(ack.ok ? null : ack.error.message);
      });
    };

    if (socket.connected) join();
    socket.on('connect', join);

    return () => {
      cancelled = true;
      socket.off('connect', join);
      if (socket.connected) leaveConversation(socket, conversationId);
    };
  }, [socket, conversationId]);

  return error;
}

/**
 * Écoute `message:new` pour toute la session : le cache de la conversation concernée est mis à
 * jour (dédupliqué sur l'id), puis la liste des conversations est invalidée pour refléter le
 * nouveau `lastMessageAt` et donc l'ordre de tri.
 */
export function useMessageStream(socket: AppSocket | null): void {
  const qc = useQueryClient();

  useEffect(() => {
    if (!socket) return;
    const onMessage = (message: MessageDto) => {
      upsertMessageInCache(qc, message);
      void qc.invalidateQueries({ queryKey: conversationsKey });
    };
    socket.on('message:new', onMessage);
    return () => {
      socket.off('message:new', onMessage);
    };
  }, [socket, qc]);
}
