import type { ClientToServerEvents, ServerToClientEvents } from '@bozochat/shared';
import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

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
