import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ClientToServerEvents,
  ConversationListItemDto,
  CreateGroupConversationInput,
  ParticipantRole,
  ServerToClientEvents,
} from '@bozochat/shared';
import { and, eq, inArray } from 'drizzle-orm';
import type { Server } from 'socket.io';
import type { Database } from '../db/client';
import { InjectDb } from '../db/db.module';
import { conversations, participants, workspaceMembers } from '../db/schema';
import { conversationRoom, userRoom } from '../realtime/rooms';
import { hasRole } from '../workspaces/workspace-roles';
import {
  canManageGroup,
  canRemoveParticipant,
  directKey,
  successorAfterLeave,
  type ConversationActor,
} from './conversation-permissions';
import { ConversationsService } from './conversations.service';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
type Executor = Database | Tx;
type Conversation = typeof conversations.$inferSelect;

const NO_ACCESS = "Vous n'avez pas accès à cette conversation.";
const NO_WORKSPACE_ACCESS = "Vous n'avez pas accès à ce workspace.";
const NOT_GROUP_ADMIN = 'Seuls les administrateurs du groupe peuvent faire cette action.';
const DIRECT_LOCKED = 'Une conversation privée ne peut pas être modifiée.';
const LAST_ADMIN = 'Le groupe doit garder au moins un administrateur.';
const NOT_A_PARTICIPANT = 'Cette personne ne fait pas partie du groupe.';

/**
 * Message du refus : un non-participant sans droit de modération reçoit le 403 générique,
 * sans apprendre si la conversation existe ni ce qu'elle est.
 */
function denied(actor: ConversationActor): ForbiddenException {
  const moderator = actor.workspaceRole !== null && hasRole(actor.workspaceRole, 'ADMIN');
  if (actor.participantRole === null && !moderator) return new ForbiddenException(NO_ACCESS);
  return new ForbiddenException(actor.type === 'DIRECT' ? DIRECT_LOCKED : NOT_GROUP_ADMIN);
}

/**
 * Création des conversations et administration des groupes (F3, F4, F9).
 * Chaque droit est recalculé à partir de la base (rôle dans la conversation et dans le
 * workspace) avec les règles pures de conversation-permissions.ts : le controller ne décide rien.
 * Après chaque changement, les participants reçoivent `conversation:updated` dans leur room
 * personnelle ; une personne retirée reçoit `conversation:removed` et quitte la room.
 */
@Injectable()
export class ConversationManagementService {
  /** Fourni par la gateway (même principe que MessagesService) : évite un cycle de modules. */
  private server: Server<ClientToServerEvents, ServerToClientEvents> | null = null;

  constructor(
    @InjectDb() private readonly db: Database,
    private readonly conversations: ConversationsService,
  ) {}

  attachServer(server: Server<ClientToServerEvents, ServerToClientEvents>): void {
    this.server = server;
  }

  /**
   * Ouvre la conversation 1:1 avec un autre membre du workspace, ou renvoie celle qui existe.
   * `ON CONFLICT DO NOTHING` sur (workspace_id, direct_key) : deux ouvertures simultanées
   * aboutissent à la même conversation, jamais à un doublon.
   */
  async openDirect(
    actorId: string,
    workspaceId: string,
    otherId: string,
  ): Promise<{ conversation: ConversationListItemDto; created: boolean }> {
    if (actorId === otherId) {
      throw new BadRequestException('Vous ne pouvez pas démarrer une conversation avec vous-même.');
    }
    await this.assertWorkspaceMembers(workspaceId, actorId, [otherId]);
    const key = directKey(actorId, otherId);

    const { id, created } = await this.db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(conversations)
        .values({ workspaceId, type: 'DIRECT', directKey: key, createdById: actorId })
        .onConflictDoNothing({ target: [conversations.workspaceId, conversations.directKey] })
        .returning({ id: conversations.id });
      const conversationId =
        inserted?.id ??
        (await tx.query.conversations.findFirst({
          where: and(eq(conversations.workspaceId, workspaceId), eq(conversations.directKey, key)),
          columns: { id: true },
        }))!.id;
      // Aussi pour une conversation existante : quelqu'un retiré puis réinvité dans le
      // workspace a perdu sa ligne participant, il la retrouve en rouvrant la conversation.
      await tx
        .insert(participants)
        .values([actorId, otherId].map((userId) => ({ conversationId, userId })))
        .onConflictDoNothing();
      return { id: conversationId, created: inserted !== undefined };
    });

    if (created) this.notifyUpdated(id, [actorId, otherId]);
    return { conversation: await this.conversations.getForUser(id, actorId), created };
  }

  /** Crée un groupe dont le créateur est administrateur. */
  async createGroup(
    actorId: string,
    input: CreateGroupConversationInput,
  ): Promise<ConversationListItemDto> {
    const others = [...new Set(input.participantIds)].filter((id) => id !== actorId);
    if (others.length === 0) {
      throw new BadRequestException('Ajoutez au moins une autre personne au groupe.');
    }
    await this.assertWorkspaceMembers(input.workspaceId, actorId, others);

    const id = await this.db.transaction(async (tx) => {
      const [conversation] = await tx
        .insert(conversations)
        .values({
          workspaceId: input.workspaceId,
          type: 'GROUP',
          name: input.name,
          createdById: actorId,
        })
        .returning({ id: conversations.id });
      await tx
        .insert(participants)
        .values([
          { conversationId: conversation!.id, userId: actorId, role: 'ADMIN' as const },
          ...others.map((userId) => ({ conversationId: conversation!.id, userId })),
        ]);
      return conversation!.id;
    });

    this.notifyUpdated(id, [actorId, ...others]);
    return this.conversations.getForUser(id, actorId);
  }

  async rename(actorId: string, conversationId: string, name: string): Promise<void> {
    await this.requireManager(conversationId, actorId);
    await this.db.update(conversations).set({ name }).where(eq(conversations.id, conversationId));
    await this.notifyParticipants(conversationId);
  }

  /** Ajoute des membres du workspace au groupe ; ceux déjà présents sont ignorés. */
  async addParticipants(actorId: string, conversationId: string, userIds: string[]): Promise<void> {
    const conversation = await this.requireManager(conversationId, actorId);
    const ids = [...new Set(userIds)];
    await this.assertTargetsInWorkspace(this.db, conversation.workspaceId, ids);

    const added = await this.db
      .insert(participants)
      .values(ids.map((userId) => ({ conversationId, userId })))
      .onConflictDoNothing()
      .returning({ userId: participants.userId });
    if (added.length > 0) await this.notifyParticipants(conversationId);
  }

  /**
   * Retire un participant, ou quitte le groupe quand `targetId === actorId`.
   * Si le dernier admin part, le participant le plus ancien le remplace ; un groupe vidé est
   * supprimé. Le tout sous verrou de la conversation : deux départs simultanés ne peuvent pas
   * laisser un groupe sans admin.
   */
  async removeParticipant(
    actorId: string,
    conversationId: string,
    targetId: string,
  ): Promise<void> {
    const { actor } = await this.loadActor(conversationId, actorId);
    if (!canRemoveParticipant(actor, actorId, targetId)) throw denied(actor);

    const remaining = await this.db.transaction(async (tx) => {
      await this.lock(tx, conversationId);
      const members = await this.members(tx, conversationId);
      if (!members.some((m) => m.userId === targetId)) {
        throw new NotFoundException(NOT_A_PARTICIPANT);
      }

      await tx
        .delete(participants)
        .where(
          and(eq(participants.conversationId, conversationId), eq(participants.userId, targetId)),
        );
      const left = members.filter((m) => m.userId !== targetId);
      if (left.length === 0) {
        await tx.delete(conversations).where(eq(conversations.id, conversationId));
        return [];
      }

      const successor = successorAfterLeave(members, targetId);
      if (successor) await this.setRole(tx, conversationId, successor, 'ADMIN');
      return left.map((m) => m.userId);
    });

    // Ses sockets déjà abonnés ne doivent plus recevoir `message:new` de ce groupe.
    this.server?.in(userRoom(targetId)).socketsLeave(conversationRoom(conversationId));
    this.server?.to(userRoom(targetId)).emit('conversation:removed', { conversationId });
    this.notifyUpdated(conversationId, remaining);
  }

  async changeRole(
    actorId: string,
    conversationId: string,
    targetId: string,
    role: ParticipantRole,
  ): Promise<void> {
    await this.requireManager(conversationId, actorId);

    const changed = await this.db.transaction(async (tx) => {
      await this.lock(tx, conversationId);
      const members = await this.members(tx, conversationId);
      const target = members.find((m) => m.userId === targetId);
      if (!target) throw new NotFoundException(NOT_A_PARTICIPANT);
      if (target.role === role) return false;
      if (role === 'MEMBER' && members.filter((m) => m.role === 'ADMIN').length === 1) {
        throw new BadRequestException(LAST_ADMIN);
      }
      await this.setRole(tx, conversationId, targetId, role);
      return true;
    });

    if (changed) await this.notifyParticipants(conversationId);
  }

  // ---------------------------------------------------------------- Accès

  private async loadActor(
    conversationId: string,
    actorId: string,
  ): Promise<{ conversation: Conversation; actor: ConversationActor }> {
    const conversation = await this.db.query.conversations.findFirst({
      where: eq(conversations.id, conversationId),
    });
    if (!conversation) throw new ForbiddenException(NO_ACCESS);

    const [participant, member] = await Promise.all([
      this.db.query.participants.findFirst({
        where: and(
          eq(participants.conversationId, conversationId),
          eq(participants.userId, actorId),
        ),
        columns: { role: true },
      }),
      this.workspaceRole(conversation.workspaceId, actorId),
    ]);
    return {
      conversation,
      actor: {
        type: conversation.type,
        participantRole: participant?.role ?? null,
        workspaceRole: member,
      },
    };
  }

  private async requireManager(conversationId: string, actorId: string): Promise<Conversation> {
    const { conversation, actor } = await this.loadActor(conversationId, actorId);
    if (!canManageGroup(actor)) throw denied(actor);
    return conversation;
  }

  private async workspaceRole(workspaceId: string, userId: string) {
    const member = await this.db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
      ),
      columns: { role: true },
    });
    return member?.role ?? null;
  }

  /** L'acteur doit appartenir au workspace (403) et chaque personne choisie aussi (400). */
  private async assertWorkspaceMembers(workspaceId: string, actorId: string, targetIds: string[]) {
    if (!(await this.workspaceRole(workspaceId, actorId))) {
      throw new ForbiddenException(NO_WORKSPACE_ACCESS);
    }
    await this.assertTargetsInWorkspace(this.db, workspaceId, targetIds);
  }

  private async assertTargetsInWorkspace(db: Executor, workspaceId: string, userIds: string[]) {
    const found = await db
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          inArray(workspaceMembers.userId, userIds),
        ),
      );
    if (found.length !== new Set(userIds).size) {
      throw new BadRequestException(
        'Toutes les personnes choisies doivent être membres du workspace.',
      );
    }
  }

  // ---------------------------------------------------------------- Base

  /** Verrou de ligne : sérialise les changements de participants d'une même conversation. */
  private async lock(tx: Tx, conversationId: string): Promise<void> {
    await tx
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .for('update');
  }

  private members(db: Executor, conversationId: string) {
    return db
      .select({
        userId: participants.userId,
        role: participants.role,
        joinedAt: participants.joinedAt,
      })
      .from(participants)
      .where(eq(participants.conversationId, conversationId));
  }

  private async setRole(
    db: Executor,
    conversationId: string,
    userId: string,
    role: ParticipantRole,
  ) {
    await db
      .update(participants)
      .set({ role })
      .where(and(eq(participants.conversationId, conversationId), eq(participants.userId, userId)));
  }

  // ---------------------------------------------------------------- Temps réel

  private async notifyParticipants(conversationId: string): Promise<void> {
    const members = await this.members(this.db, conversationId);
    this.notifyUpdated(
      conversationId,
      members.map((m) => m.userId),
    );
  }

  private notifyUpdated(conversationId: string, userIds: string[]): void {
    // Garde indispensable : `to([])` ne cible aucune room, donc diffuserait à tous les sockets.
    if (userIds.length === 0) return;
    this.server?.to(userIds.map(userRoom)).emit('conversation:updated', { conversationId });
  }
}
