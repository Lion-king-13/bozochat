/** Types échangés entre le client et le serveur (réponses API et événements WebSocket). */

import type { Plan, SendMessageInput, WorkspaceRole } from './schemas';

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

/** Auteur tel qu'exposé dans un message : jamais l'e-mail. */
export type MessageAuthor = Pick<PublicUser, 'id' | 'displayName' | 'avatarUrl'>;

export interface MessageDto {
  id: string;
  conversationId: string;
  author: MessageAuthor | null;
  content: string;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
}

export type ConversationType = 'DIRECT' | 'GROUP';

/** Une entrée de la liste « mes conversations » (triée par activité). */
export interface ConversationListItemDto {
  id: string;
  workspaceId: string;
  type: ConversationType;
  /** null pour les conversations DIRECT : le nom affiché vient des participants. */
  name: string | null;
  createdAt: string;
  lastMessageAt: string;
  participants: MessageAuthor[];
}

/** Page d'historique : les messages sont du plus récent au plus ancien. */
export interface MessagePageDto {
  items: MessageDto[];
  /** À repasser en `?cursor=` pour la page suivante ; null quand il n'y a plus rien. */
  nextCursor: string | null;
  hasMore: boolean;
}

/** Format unique des erreurs renvoyées par l'API — jamais de stack trace. */
export interface ApiError {
  statusCode: number;
  message: string;
  /** Erreurs par champ de formulaire, ex. { email: "L'adresse e-mail n'est pas valide." } */
  fieldErrors?: Record<string, string>;
}

/** Accusé de réception d'un événement WebSocket sans valeur de retour. */
export type Ack = { ok: true } | { ok: false; error: ApiError };
/** Accusé de réception de `message:send` : le message créé, ou l'erreur. */
export type SendMessageAck = { ok: true; message: MessageDto } | { ok: false; error: ApiError };

/** Événements Socket.IO */
export interface ServerToClientEvents {
  'message:new': (message: MessageDto) => void;
  'notification:new': (payload: { conversationId: string; message: MessageDto }) => void;
}

export interface ClientToServerEvents {
  'conversation:join': (payload: { conversationId: string }, ack: (res: Ack) => void) => void;
  'conversation:leave': (payload: { conversationId: string }) => void;
  'message:send': (payload: SendMessageInput, ack: (res: SendMessageAck) => void) => void;
}

/** Un workspace vu par l'un de ses membres (`role` = le rôle de l'utilisateur connecté). */
export interface WorkspaceDto {
  id: string;
  name: string;
  slug: string;
  plan: Plan;
  role: WorkspaceRole;
  memberCount: number;
  /** Quota de membres du plan — null si illimité. */
  memberLimit: number | null;
  createdAt: string;
}

export interface WorkspaceMemberDto {
  user: MessageAuthor & { email: string };
  role: WorkspaceRole;
  joinedAt: string;
}

/** Invitation en attente, vue par les admins du workspace. */
export interface InvitationDto {
  id: string;
  email: string;
  role: WorkspaceRole;
  invitedBy: MessageAuthor | null;
  createdAt: string;
  expiresAt: string;
}

/** Invitation reçue, vue par la personne invitée. */
export interface ReceivedInvitationDto {
  id: string;
  workspace: { id: string; name: string };
  role: WorkspaceRole;
  invitedBy: MessageAuthor | null;
  expiresAt: string;
}
