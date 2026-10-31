import type { ConversationListItemDto, MessageDto } from '@bozochat/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  allMessagesKey,
  conversationsKey,
  useMarkConversationRead,
  upsertMessageInCache,
} from './conversations';
import type { AppSocket } from './socket';

/** Regroupe les marquages d'une rafale de messages en un seul appel au serveur. */
const MARK_READ_DELAY_MS = 300;

type ToastProps = {
  message: MessageDto;
  conversationName: string | null;
  onOpen: () => void;
};

/** Toute la carte est cliquable. Le contenu est rendu comme du texte, jamais comme du HTML. */
function MessageToast({ message, conversationName, onOpen }: ToastProps) {
  const author = message.author?.displayName ?? 'Utilisateur supprimé';
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-lg border border-stone-200 border-l-4 border-l-brand-500 bg-white px-3 py-2 text-left shadow-sm hover:bg-stone-50 sm:w-80"
    >
      <span className="block truncate text-sm font-semibold text-ink">
        {conversationName ? `${author} · ${conversationName}` : author}
      </span>
      <span className="mt-0.5 line-clamp-2 text-sm break-words text-stone-600">
        {message.content}
      </span>
    </button>
  );
}

/**
 * Tient à jour les non-lus pendant toute la session : écoute `notification:new`, marque comme lue
 * la conversation affichée et se resynchronise à chaque (re)connexion du socket.
 * L'affichage ne compte pas sur les événements reçus : ils déclenchent une relecture de la base.
 */
export function useNotifications(
  socket: AppSocket | null,
  activeConversationId: string | undefined,
): void {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { mutate: markRead } = useMarkConversationRead();
  // Lue par les écouteurs et le minuteur : changer de conversation ne les réabonne pas.
  const activeRef = useRef(activeConversationId);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Point de passage unique du marquage (ouverture, message reçu, retour sur l'onglet, reconnexion).
   * Un onglet masqué n'affiche rien : il ne doit pas consommer les non-lus à la place de l'onglet
   * que l'utilisateur regarde, il le fera à son retour (`visibilitychange`).
   */
  const scheduleMarkRead = useCallback(() => {
    if (timerRef.current !== null) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (activeRef.current && document.visibilityState === 'visible') {
        markRead(activeRef.current);
      }
    }, MARK_READ_DELAY_MS);
  }, [markRead]);

  useEffect(() => {
    activeRef.current = activeConversationId;
    if (activeConversationId) scheduleMarkRead();
  }, [activeConversationId, scheduleMarkRead]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') scheduleMarkRead();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [scheduleMarkRead]);

  useEffect(() => {
    if (!socket) return;

    const onNotification = ({
      conversationId,
      message,
    }: {
      conversationId: string;
      message: MessageDto;
    }) => {
      // Dédupliqué sur l'id : couvre aussi un message arrivé juste avant d'avoir rejoint la room.
      upsertMessageInCache(qc, message);

      // Conversation affichée : pas de toast. `message:new` et le marquage relisent déjà la liste.
      if (conversationId === activeRef.current) {
        scheduleMarkRead();
        return;
      }

      void qc.invalidateQueries({ queryKey: conversationsKey });
      const conversation = qc
        .getQueryData<ConversationListItemDto[]>(conversationsKey)
        ?.find((c) => c.id === conversationId);
      // `id` : une rafale dans une même conversation met à jour un seul toast au lieu d'en empiler.
      toast.custom(
        (id) => (
          <MessageToast
            message={message}
            conversationName={conversation?.name ?? null}
            onOpen={() => {
              toast.dismiss(id);
              void navigate(`/app/c/${conversationId}`);
            }}
          />
        ),
        { id: conversationId },
      );
    };

    // Les événements émis pendant la coupure sont perdus : la base fait foi au retour.
    const onConnect = () => {
      void qc.invalidateQueries({ queryKey: conversationsKey });
      void qc.invalidateQueries({ queryKey: allMessagesKey });
      scheduleMarkRead();
    };

    socket.on('notification:new', onNotification);
    socket.on('connect', onConnect);
    return () => {
      socket.off('notification:new', onNotification);
      socket.off('connect', onConnect);
    };
  }, [socket, qc, navigate, scheduleMarkRead]);
}
