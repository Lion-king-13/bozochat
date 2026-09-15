/** Types échangés entre le client et le serveur (réponses API et événements WebSocket). */

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface MessageDto {
  id: string;
  conversationId: string;
  author: Pick<PublicUser, 'id' | 'displayName' | 'avatarUrl'> | null;
  content: string;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
}

/** Format unique des erreurs renvoyées par l'API — jamais de stack trace. */
export interface ApiError {
  statusCode: number;
  message: string;
  /** Erreurs par champ de formulaire, ex. { email: "L'adresse e-mail n'est pas valide." } */
  fieldErrors?: Record<string, string>;
}

/** Événements Socket.IO */
export interface ServerToClientEvents {
  'message:new': (message: MessageDto) => void;
  'notification:new': (payload: { conversationId: string; message: MessageDto }) => void;
}

export interface ClientToServerEvents {
  'conversation:join': (
    payload: { conversationId: string },
    ack: (res: { ok: true } | { ok: false; error: ApiError }) => void,
  ) => void;
  'conversation:leave': (payload: { conversationId: string }) => void;
}
