import type { ConversationType, ParticipantRole, WorkspaceRole } from '@bozochat/shared';
import { hasRole } from '../workspaces/workspace-roles';

/** Ce que l'on sait de l'utilisateur qui agit sur une conversation. */
export interface ConversationActor {
  type: ConversationType;
  /** null : l'utilisateur n'est pas participant. */
  participantRole: ParticipantRole | null;
  /** null : l'utilisateur n'est pas membre du workspace de la conversation. */
  workspaceRole: WorkspaceRole | null;
}

/**
 * Renommer, ajouter des participants, changer les rôles : admin du groupe, ou admin/owner du
 * workspace (modération, cahier des charges §2). Une conversation privée ne se gère jamais.
 */
export function canManageGroup(actor: ConversationActor): boolean {
  if (actor.type !== 'GROUP') return false;
  if (actor.participantRole === 'ADMIN') return true;
  return actor.workspaceRole !== null && hasRole(actor.workspaceRole, 'ADMIN');
}

/** Retirer quelqu'un : un gestionnaire du groupe, ou n'importe quel participant pour lui-même. */
export function canRemoveParticipant(
  actor: ConversationActor,
  actorId: string,
  targetId: string,
): boolean {
  if (actor.type !== 'GROUP') return false;
  if (actorId === targetId) return actor.participantRole !== null;
  return canManageGroup(actor);
}

/**
 * Clé d'unicité d'une conversation 1:1 : identique quel que soit celui qui l'ouvre.
 * La contrainte `conversations_direct_key_uq (workspace_id, direct_key)` empêche les doublons,
 * y compris quand deux requêtes arrivent en même temps.
 */
export function directKey(userA: string, userB: string): string {
  return [userA, userB].sort().join(':');
}

/**
 * Un groupe garde toujours un admin : si le départ de `leavingId` n'en laisse aucun, renvoie le
 * participant restant le plus ancien, à promouvoir. `null` si rien à faire ou plus personne.
 */
export function successorAfterLeave(
  members: { userId: string; role: ParticipantRole; joinedAt: Date }[],
  leavingId: string,
): string | null {
  const remaining = members.filter((m) => m.userId !== leavingId);
  if (remaining.length === 0 || remaining.some((m) => m.role === 'ADMIN')) return null;
  const [oldest] = [...remaining].sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
  return oldest!.userId;
}
