import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PLAN_LIMITS,
  type AssignableRole,
  type ClientToServerEvents,
  type InvitationDto,
  type Plan,
  type PublicUser,
  type ReceivedInvitationDto,
  type ServerToClientEvents,
  type UpdateWorkspaceInput,
  type WorkspaceDto,
  type WorkspaceMemberDto,
  type WorkspaceRole,
} from '@bozochat/shared';
import { and, asc, eq, gt, inArray, ne, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import type { Server } from 'socket.io';
import type { Database } from '../db/client';
import { InjectDb } from '../db/db.module';
import {
  conversations,
  participants,
  users,
  workspaceInvitations,
  workspaceMembers,
  workspaces,
} from '../db/schema';
import { conversationRoom, userRoom } from '../realtime/rooms';
import { hasRole, outranks, slugify } from './workspace-roles';

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

const NO_ACCESS = "Vous n'avez pas accès à ce workspace.";
const INVITATION_NOT_FOUND = 'Invitation introuvable ou expirée.';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
type Executor = Database | Tx;
type Workspace = typeof workspaces.$inferSelect;

function quotaMessage(limit: number): string {
  return `Votre plan Free est limité à ${limit} membres — passez à Pro.`;
}

function toWorkspaceDto(
  workspace: Workspace,
  role: WorkspaceRole,
  memberCount: number,
): WorkspaceDto {
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    plan: workspace.plan,
    role,
    memberCount,
    memberLimit: PLAN_LIMITS[workspace.plan].members,
    createdAt: workspace.createdAt.toISOString(),
  };
}

/**
 * Gestion des workspaces, de leurs membres et des invitations.
 * Toutes les permissions sont vérifiées ici, à partir du rôle **en base** de l'utilisateur
 * de la session : le controller ne fait que transmettre, il ne décide jamais.
 */
@Injectable()
export class WorkspacesService {
  /** Fourni par la gateway (même principe que MessagesService) : évite un cycle de modules. */
  private server: Server<ClientToServerEvents, ServerToClientEvents> | null = null;

  constructor(@InjectDb() private readonly db: Database) {}

  attachServer(server: Server<ClientToServerEvents, ServerToClientEvents>): void {
    this.server = server;
  }

  // ---------------------------------------------------------------- Workspaces

  async listForUser(userId: string): Promise<WorkspaceDto[]> {
    const rows = await this.db
      .select({
        workspace: workspaces,
        role: workspaceMembers.role,
        memberCount: sql<number>`(select count(*)::int from ${workspaceMembers} m where m.workspace_id = ${workspaces.id})`,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(eq(workspaceMembers.userId, userId))
      .orderBy(asc(workspaces.name), asc(workspaces.id));
    return rows.map((r) => toWorkspaceDto(r.workspace, r.role, r.memberCount));
  }

  /** Le créateur devient OWNER, dans la même transaction que la création. */
  async create(userId: string, name: string): Promise<WorkspaceDto> {
    const workspace = await this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(workspaces)
        .values({ name, slug: slugify(name, randomBytes(3).toString('hex')) })
        .returning();
      await tx.insert(workspaceMembers).values({ workspaceId: created!.id, userId, role: 'OWNER' });
      return created!;
    });
    return toWorkspaceDto(workspace, 'OWNER', 1);
  }

  async get(workspaceId: string, userId: string): Promise<WorkspaceDto> {
    const role = await this.requireRole(workspaceId, userId, 'MEMBER');
    const workspace = await this.requireWorkspace(this.db, workspaceId);
    return toWorkspaceDto(workspace, role, await this.countMembers(this.db, workspaceId));
  }

  /** Renommer : admin. Changer de plan : owner uniquement (paiement simulé). */
  async update(
    workspaceId: string,
    userId: string,
    input: UpdateWorkspaceInput,
  ): Promise<WorkspaceDto> {
    const role = await this.requireRole(workspaceId, userId, 'ADMIN');
    if (input.plan !== undefined && role !== 'OWNER') {
      throw new ForbiddenException('Seul le propriétaire du workspace peut changer de plan.');
    }

    const workspace = await this.db.transaction(async (tx) => {
      const current = await this.lockWorkspace(tx, workspaceId);
      const patch: { name?: string; plan?: Plan } = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.plan !== undefined && input.plan !== current.plan) {
        // Pas de rétrogradation qui laisserait un workspace au-delà de son quota.
        const limit = PLAN_LIMITS[input.plan].members;
        if (limit !== null && (await this.countMembers(tx, workspaceId)) > limit) {
          throw new ConflictException(
            `Le plan Free est limité à ${limit} membres : retirez des membres avant de changer de plan.`,
          );
        }
        patch.plan = input.plan;
      }
      if (Object.keys(patch).length === 0) return current;
      const [updated] = await tx
        .update(workspaces)
        .set(patch)
        .where(eq(workspaces.id, workspaceId))
        .returning();
      return updated!;
    });
    return toWorkspaceDto(workspace, role, await this.countMembers(this.db, workspaceId));
  }

  /** Suppression définitive (cascade : membres, invitations, conversations, messages). */
  async remove(workspaceId: string, userId: string): Promise<void> {
    const role = await this.requireRole(workspaceId, userId, 'MEMBER');
    if (role !== 'OWNER') {
      throw new ForbiddenException('Seul le propriétaire peut supprimer le workspace.');
    }
    const convs = await this.db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.workspaceId, workspaceId));
    await this.db.delete(workspaces).where(eq(workspaces.id, workspaceId));
    // Plus personne ne doit rester abonné aux rooms de conversations disparues.
    const rooms = convs.map((c) => conversationRoom(c.id));
    if (rooms.length > 0) this.server?.socketsLeave(rooms);
  }

  // ---------------------------------------------------------------- Membres

  async listMembers(workspaceId: string, userId: string): Promise<WorkspaceMemberDto[]> {
    await this.requireRole(workspaceId, userId, 'MEMBER');
    const rows = await this.db.query.workspaceMembers.findMany({
      where: eq(workspaceMembers.workspaceId, workspaceId),
      with: {
        user: { columns: { id: true, email: true, displayName: true, avatarUrl: true } },
      },
    });
    const order: Record<WorkspaceRole, number> = { OWNER: 0, ADMIN: 1, MEMBER: 2 };
    return rows
      .sort(
        (a, b) =>
          order[a.role] - order[b.role] || a.user.displayName.localeCompare(b.user.displayName),
      )
      .map((m) => ({ user: m.user, role: m.role, joinedAt: m.joinedAt.toISOString() }));
  }

  /**
   * Changer le rôle d'un autre membre. Il faut être admin et **strictement** au-dessus de la
   * cible : un admin gère les membres, seul l'owner gère les admins, personne ne touche l'owner.
   */
  async updateMemberRole(
    workspaceId: string,
    actorId: string,
    targetId: string,
    role: AssignableRole,
  ): Promise<WorkspaceMemberDto> {
    const actorRole = await this.requireRole(workspaceId, actorId, 'ADMIN');
    if (actorId === targetId) {
      throw new ForbiddenException('Vous ne pouvez pas modifier votre propre rôle.');
    }
    const target = await this.requireMember(workspaceId, targetId);
    this.assertCanManage(actorRole, target.role);

    const [updated] = await this.db
      .update(workspaceMembers)
      .set({ role })
      .where(
        and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, targetId)),
      )
      .returning();
    const user = await this.db.query.users.findFirst({
      where: eq(users.id, targetId),
      columns: { id: true, email: true, displayName: true, avatarUrl: true },
    });
    return { user: user!, role: updated!.role, joinedAt: updated!.joinedAt.toISOString() };
  }

  /**
   * Retirer un membre — ou se retirer soi-même (quitter). L'owner ne peut ni être retiré
   * ni partir : le workspace n'est jamais laissé sans propriétaire.
   * Le membre perd aussi l'accès à toutes les conversations du workspace, y compris en temps réel.
   */
  async removeMember(workspaceId: string, actorId: string, targetId: string): Promise<void> {
    const actorRole = await this.requireRole(workspaceId, actorId, 'MEMBER');
    if (actorId === targetId) {
      if (actorRole === 'OWNER') {
        throw new ForbiddenException(
          'Le propriétaire ne peut pas quitter son workspace : supprimez-le à la place.',
        );
      }
    } else {
      if (!hasRole(actorRole, 'ADMIN')) {
        throw new ForbiddenException('Seuls les administrateurs peuvent retirer des membres.');
      }
      const target = await this.requireMember(workspaceId, targetId);
      this.assertCanManage(actorRole, target.role);
    }

    const left = await this.db.transaction(async (tx) => {
      const removed = await tx
        .delete(participants)
        .where(
          and(
            eq(participants.userId, targetId),
            inArray(
              participants.conversationId,
              tx
                .select({ id: conversations.id })
                .from(conversations)
                .where(eq(conversations.workspaceId, workspaceId)),
            ),
          ),
        )
        .returning({ conversationId: participants.conversationId });
      await tx
        .delete(workspaceMembers)
        .where(
          and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, targetId)),
        );
      return removed.map((p) => p.conversationId);
    });

    // Les sockets déjà abonnés ne doivent plus recevoir `message:new` de ces conversations.
    if (left.length > 0) {
      this.server?.in(userRoom(targetId)).socketsLeave(left.map(conversationRoom));
    }
  }

  // ---------------------------------------------------------------- Invitations

  /**
   * Invite une adresse e-mail (le compte peut ne pas encore exister). Réinviter la même adresse
   * remplace l'invitation précédente. Le quota compte les membres **et** les invitations en
   * attente : un workspace Free ne peut pas promettre plus de places qu'il n'en a.
   */
  async invite(
    workspaceId: string,
    actor: PublicUser,
    email: string,
    role: AssignableRole,
  ): Promise<InvitationDto> {
    await this.requireRole(workspaceId, actor.id, 'ADMIN');

    const invitation = await this.db.transaction(async (tx) => {
      const workspace = await this.lockWorkspace(tx, workspaceId);

      const [alreadyMember] = await tx
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .innerJoin(users, eq(users.id, workspaceMembers.userId))
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(users.email, email)));
      if (alreadyMember) {
        throw new ConflictException({
          message: 'Cette personne est déjà membre du workspace.',
          fieldErrors: { email: 'Cette personne est déjà membre du workspace.' },
        });
      }

      const limit = PLAN_LIMITS[workspace.plan].members;
      if (limit !== null) {
        const members = await this.countMembers(tx, workspaceId);
        const [pending] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(workspaceInvitations)
          .where(
            and(
              eq(workspaceInvitations.workspaceId, workspaceId),
              gt(workspaceInvitations.expiresAt, new Date()),
              ne(workspaceInvitations.email, email),
            ),
          );
        if (members + pending!.n >= limit) throw new ForbiddenException(quotaMessage(limit));
      }

      const values = {
        workspaceId,
        email,
        role,
        invitedById: actor.id,
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
        createdAt: new Date(),
      };
      const [row] = await tx
        .insert(workspaceInvitations)
        .values(values)
        .onConflictDoUpdate({
          target: [workspaceInvitations.workspaceId, workspaceInvitations.email],
          set: {
            role: values.role,
            invitedById: values.invitedById,
            expiresAt: values.expiresAt,
            createdAt: values.createdAt,
          },
        })
        .returning();
      return row!;
    });

    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      invitedBy: { id: actor.id, displayName: actor.displayName, avatarUrl: actor.avatarUrl },
      createdAt: invitation.createdAt.toISOString(),
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  /** Invitations en attente (non expirées) — réservé aux admins. */
  async listInvitations(workspaceId: string, userId: string): Promise<InvitationDto[]> {
    await this.requireRole(workspaceId, userId, 'ADMIN');
    const rows = await this.db.query.workspaceInvitations.findMany({
      where: and(
        eq(workspaceInvitations.workspaceId, workspaceId),
        gt(workspaceInvitations.expiresAt, new Date()),
      ),
      orderBy: [asc(workspaceInvitations.createdAt)],
      with: { invitedBy: { columns: { id: true, displayName: true, avatarUrl: true } } },
    });
    return rows.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      invitedBy: i.invitedBy,
      createdAt: i.createdAt.toISOString(),
      expiresAt: i.expiresAt.toISOString(),
    }));
  }

  async revokeInvitation(workspaceId: string, userId: string, invitationId: string) {
    await this.requireRole(workspaceId, userId, 'ADMIN');
    const deleted = await this.db
      .delete(workspaceInvitations)
      .where(
        and(
          eq(workspaceInvitations.id, invitationId),
          eq(workspaceInvitations.workspaceId, workspaceId),
        ),
      )
      .returning({ id: workspaceInvitations.id });
    if (deleted.length === 0) throw new NotFoundException(INVITATION_NOT_FOUND);
  }

  /** Invitations adressées à l'e-mail du compte connecté. */
  async listReceived(user: PublicUser): Promise<ReceivedInvitationDto[]> {
    const rows = await this.db.query.workspaceInvitations.findMany({
      where: and(
        eq(workspaceInvitations.email, user.email),
        gt(workspaceInvitations.expiresAt, new Date()),
      ),
      orderBy: [asc(workspaceInvitations.createdAt)],
      with: {
        workspace: { columns: { id: true, name: true } },
        invitedBy: { columns: { id: true, displayName: true, avatarUrl: true } },
      },
    });
    return rows.map((i) => ({
      id: i.id,
      workspace: i.workspace,
      role: i.role,
      invitedBy: i.invitedBy,
      expiresAt: i.expiresAt.toISOString(),
    }));
  }

  /**
   * Rejoindre un workspace. Le quota est revérifié ici, sous verrou du workspace :
   * deux acceptations simultanées ne peuvent pas dépasser la limite du plan.
   */
  async acceptInvitation(invitationId: string, user: PublicUser): Promise<WorkspaceDto> {
    const { workspace, role } = await this.db.transaction(async (tx) => {
      const invitation = await this.findReceived(tx, invitationId, user);
      const workspace = await this.lockWorkspace(tx, invitation.workspaceId);

      const existing = await tx.query.workspaceMembers.findFirst({
        where: and(
          eq(workspaceMembers.workspaceId, workspace.id),
          eq(workspaceMembers.userId, user.id),
        ),
      });
      if (!existing) {
        const limit = PLAN_LIMITS[workspace.plan].members;
        if (limit !== null && (await this.countMembers(tx, workspace.id)) >= limit) {
          throw new ForbiddenException(quotaMessage(limit));
        }
        await tx
          .insert(workspaceMembers)
          .values({ workspaceId: workspace.id, userId: user.id, role: invitation.role });
      }
      await tx.delete(workspaceInvitations).where(eq(workspaceInvitations.id, invitation.id));
      return { workspace, role: existing?.role ?? invitation.role };
    });
    return toWorkspaceDto(workspace, role, await this.countMembers(this.db, workspace.id));
  }

  async declineInvitation(invitationId: string, user: PublicUser): Promise<void> {
    const deleted = await this.db
      .delete(workspaceInvitations)
      .where(
        and(eq(workspaceInvitations.id, invitationId), eq(workspaceInvitations.email, user.email)),
      )
      .returning({ id: workspaceInvitations.id });
    if (deleted.length === 0) throw new NotFoundException(INVITATION_NOT_FOUND);
  }

  // ---------------------------------------------------------------- Contrôles d'accès

  /**
   * Rôle de l'utilisateur dans le workspace, s'il atteint `minimum`.
   * Non-membre : 403 générique, sans révéler si le workspace existe.
   */
  async requireRole(
    workspaceId: string,
    userId: string,
    minimum: WorkspaceRole,
  ): Promise<WorkspaceRole> {
    const member = await this.db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
      ),
      columns: { role: true },
    });
    if (!member) throw new ForbiddenException(NO_ACCESS);
    if (!hasRole(member.role, minimum)) {
      throw new ForbiddenException('Cette action est réservée aux administrateurs du workspace.');
    }
    return member.role;
  }

  private async requireMember(workspaceId: string, userId: string) {
    const member = await this.db.query.workspaceMembers.findFirst({
      where: and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
      ),
    });
    if (!member) throw new NotFoundException("Ce membre n'appartient pas au workspace.");
    return member;
  }

  private assertCanManage(actorRole: WorkspaceRole, targetRole: WorkspaceRole): void {
    if (targetRole === 'OWNER') {
      throw new ForbiddenException(
        'Le propriétaire du workspace ne peut pas être modifié ni retiré.',
      );
    }
    if (!outranks(actorRole, targetRole)) {
      throw new ForbiddenException('Seul le propriétaire peut gérer les administrateurs.');
    }
  }

  private async findReceived(tx: Tx, invitationId: string, user: PublicUser) {
    const invitation = await tx.query.workspaceInvitations.findFirst({
      where: and(
        eq(workspaceInvitations.id, invitationId),
        eq(workspaceInvitations.email, user.email),
        gt(workspaceInvitations.expiresAt, new Date()),
      ),
    });
    if (!invitation) throw new NotFoundException(INVITATION_NOT_FOUND);
    return invitation;
  }

  private async requireWorkspace(db: Executor, workspaceId: string): Promise<Workspace> {
    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, workspaceId),
    });
    if (!workspace) throw new ForbiddenException(NO_ACCESS);
    return workspace;
  }

  /** Verrou de ligne : sérialise les opérations qui dépendent du nombre de membres. */
  private async lockWorkspace(tx: Tx, workspaceId: string): Promise<Workspace> {
    const [workspace] = await tx
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .for('update');
    if (!workspace) throw new ForbiddenException(NO_ACCESS);
    return workspace;
  }

  private async countMembers(db: Executor, workspaceId: string): Promise<number> {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, workspaceId));
    return row!.n;
  }
}
