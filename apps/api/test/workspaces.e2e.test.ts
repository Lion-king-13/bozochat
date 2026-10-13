import type { NestExpressApplication } from '@nestjs/platform-express';
import type { InvitationDto, WorkspaceDto, WorkspaceMemberDto } from '@bozochat/shared';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '../src/db/client';
import {
  conversations,
  participants,
  workspaceInvitations,
  workspaceMembers,
  users,
  workspaces,
} from '../src/db/schema';
import { createTestApp, resetDb, signup, type TestUser } from './helpers';

/**
 * Scénario de validation : créer un workspace → inviter Thomas → Thomas rejoint →
 * changer son rôle → retirer un membre, avec refus des actions interdites.
 */
describe('Workspaces & membres (e2e)', () => {
  let app: NestExpressApplication;
  let db: Database;

  // Une application par test : les compteurs de limitation de débit repartent de zéro.
  beforeEach(async () => {
    ({ app, db } = await createTestApp());
    await resetDb(db);
  });
  afterEach(() => app.close());

  const http = () => request(app.getHttpServer());

  async function createWorkspace(owner: TestUser, name = 'Agence Test') {
    const res = await http().post('/api/workspaces').set('Cookie', owner.cookie).send({ name });
    expect(res.status).toBe(201);
    return res.body as WorkspaceDto;
  }

  async function invite(actor: TestUser, workspaceId: string, email: string, role?: string) {
    return http()
      .post(`/api/workspaces/${workspaceId}/invitations`)
      .set('Cookie', actor.cookie)
      .send({ email, role });
  }

  /** Invite puis accepte : l'utilisateur devient membre avec `role`. */
  async function addMember(
    owner: TestUser,
    workspaceId: string,
    user: TestUser,
    name: string,
    role = 'MEMBER',
  ) {
    const inv = await invite(owner, workspaceId, `${name}@test.be`, role);
    expect(inv.status).toBe(201);
    const res = await http()
      .post(`/api/invitations/${(inv.body as InvitationDto).id}/accept`)
      .set('Cookie', user.cookie);
    expect(res.status).toBe(200);
  }

  async function members(user: TestUser, workspaceId: string) {
    const res = await http()
      .get(`/api/workspaces/${workspaceId}/members`)
      .set('Cookie', user.cookie);
    return res.body as WorkspaceMemberDto[];
  }

  it('parcours complet : créer, inviter, rejoindre, changer le rôle, retirer', async () => {
    const julie = await signup(app, 'julie');
    const thomas = await signup(app, 'thomas');

    // 1. Créer : le créateur est OWNER
    const ws = await createWorkspace(julie, 'Agence Orion');
    expect(ws).toMatchObject({ name: 'Agence Orion', role: 'OWNER', plan: 'FREE', memberCount: 1 });
    expect(ws.slug).toMatch(/^agence-orion-[0-9a-f]{6}$/);

    // 2. Inviter Thomas par e-mail
    const inv = await invite(julie, ws.id, 'Thomas@Test.be');
    expect(inv.status).toBe(201);
    expect(inv.body).toMatchObject({ email: 'thomas@test.be', role: 'MEMBER' });

    // 3. Thomas voit l'invitation et rejoint
    const received = await http().get('/api/invitations').set('Cookie', thomas.cookie);
    expect(received.body).toEqual([
      expect.objectContaining({ id: inv.body.id, workspace: { id: ws.id, name: 'Agence Orion' } }),
    ]);
    const accepted = await http()
      .post(`/api/invitations/${inv.body.id}/accept`)
      .set('Cookie', thomas.cookie);
    expect(accepted.status).toBe(200);
    expect(accepted.body).toMatchObject({ id: ws.id, role: 'MEMBER', memberCount: 2 });
    expect((await members(julie, ws.id)).map((m) => [m.user.id, m.role])).toEqual([
      [julie.id, 'OWNER'],
      [thomas.id, 'MEMBER'],
    ]);
    // L'invitation est consommée
    const after = await http().get('/api/invitations').set('Cookie', thomas.cookie);
    expect(after.body).toEqual([]);

    // 4. Changer son rôle
    const promoted = await http()
      .patch(`/api/workspaces/${ws.id}/members/${thomas.id}`)
      .set('Cookie', julie.cookie)
      .send({ role: 'ADMIN' });
    expect(promoted.status).toBe(200);
    expect(promoted.body).toMatchObject({ role: 'ADMIN', user: { id: thomas.id } });

    // 5. Retirer un membre
    const removed = await http()
      .delete(`/api/workspaces/${ws.id}/members/${thomas.id}`)
      .set('Cookie', julie.cookie);
    expect(removed.status).toBe(204);
    const denied = await http().get(`/api/workspaces/${ws.id}`).set('Cookie', thomas.cookie);
    expect(denied.status).toBe(403);
  });

  it('liste uniquement les workspaces dont on est membre', async () => {
    const julie = await signup(app, 'julie');
    const eve = await signup(app, 'eve');
    const ws = await createWorkspace(julie);
    await createWorkspace(eve, 'Autre');

    const res = await http().get('/api/workspaces').set('Cookie', julie.cookie);
    expect(res.body).toEqual([expect.objectContaining({ id: ws.id })]);
    expect((await http().get(`/api/workspaces/${ws.id}`).set('Cookie', eve.cookie)).status).toBe(
      403,
    );
    expect(
      (await http().get(`/api/workspaces/${ws.id}/members`).set('Cookie', eve.cookie)).status,
    ).toBe(403);
  });

  it('exige une session et valide les entrées', async () => {
    expect((await http().get('/api/workspaces')).status).toBe(401);
    const julie = await signup(app, 'julie');
    const res = await http()
      .post('/api/workspaces')
      .set('Cookie', julie.cookie)
      .send({ name: ' ' });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors.name).toBeDefined();
    expect(
      (await http().get('/api/workspaces/pas-un-uuid').set('Cookie', julie.cookie)).status,
    ).toBe(400);
  });

  describe('un membre standard ne gère pas les autres membres', () => {
    it('refuse invitation, changement de rôle, retrait et liste des invitations', async () => {
      const julie = await signup(app, 'julie');
      const thomas = await signup(app, 'thomas');
      const leo = await signup(app, 'leo');
      const ws = await createWorkspace(julie);
      await addMember(julie, ws.id, thomas, 'thomas');
      await addMember(julie, ws.id, leo, 'leo');

      expect((await invite(thomas, ws.id, 'zoe@test.be')).status).toBe(403);
      expect(
        (
          await http()
            .patch(`/api/workspaces/${ws.id}/members/${leo.id}`)
            .set('Cookie', thomas.cookie)
            .send({ role: 'ADMIN' })
        ).status,
      ).toBe(403);
      expect(
        (
          await http()
            .delete(`/api/workspaces/${ws.id}/members/${leo.id}`)
            .set('Cookie', thomas.cookie)
        ).status,
      ).toBe(403);
      expect(
        (await http().get(`/api/workspaces/${ws.id}/invitations`).set('Cookie', thomas.cookie))
          .status,
      ).toBe(403);
      expect(
        (
          await http()
            .patch(`/api/workspaces/${ws.id}`)
            .set('Cookie', thomas.cookie)
            .send({ name: 'Piraté' })
        ).status,
      ).toBe(403);
      expect(
        (await http().delete(`/api/workspaces/${ws.id}`).set('Cookie', thomas.cookie)).status,
      ).toBe(403);
      // Rien n'a changé
      expect((await members(julie, ws.id)).map((m) => m.role)).toEqual([
        'OWNER',
        'MEMBER',
        'MEMBER',
      ]);
    });

    it('autorise un membre à quitter le workspace', async () => {
      const julie = await signup(app, 'julie');
      const thomas = await signup(app, 'thomas');
      const ws = await createWorkspace(julie);
      await addMember(julie, ws.id, thomas, 'thomas');

      const res = await http()
        .delete(`/api/workspaces/${ws.id}/members/${thomas.id}`)
        .set('Cookie', thomas.cookie);
      expect(res.status).toBe(204);
      expect((await members(julie, ws.id)).map((m) => m.user.id)).toEqual([julie.id]);
    });
  });

  describe('protection du rôle owner', () => {
    it("un admin ne peut ni modifier ni retirer l'owner, ni gérer un autre admin", async () => {
      const julie = await signup(app, 'julie');
      const thomas = await signup(app, 'thomas');
      const camille = await signup(app, 'camille');
      const leo = await signup(app, 'leo');
      const ws = await createWorkspace(julie);
      await addMember(julie, ws.id, thomas, 'thomas', 'ADMIN');
      await addMember(julie, ws.id, camille, 'camille', 'ADMIN');
      await addMember(thomas, ws.id, leo, 'leo');

      const asThomas = (method: 'patch' | 'delete', target: string) =>
        http()[method](`/api/workspaces/${ws.id}/members/${target}`).set('Cookie', thomas.cookie);

      const demoteOwner = await asThomas('patch', julie.id).send({ role: 'MEMBER' });
      expect(demoteOwner.status).toBe(403);
      expect(demoteOwner.body.message).toMatch(/propriétaire/);
      expect((await asThomas('delete', julie.id)).status).toBe(403);
      expect((await asThomas('patch', camille.id).send({ role: 'MEMBER' })).status).toBe(403);
      expect((await asThomas('delete', camille.id)).status).toBe(403);

      // Un admin gère les membres standards
      expect((await asThomas('patch', leo.id).send({ role: 'ADMIN' })).status).toBe(200);
      // L'owner gère les admins
      const demote = await http()
        .patch(`/api/workspaces/${ws.id}/members/${camille.id}`)
        .set('Cookie', julie.cookie)
        .send({ role: 'MEMBER' });
      expect(demote.status).toBe(200);
    });

    it("l'owner ne peut pas changer son propre rôle ni quitter son workspace", async () => {
      const julie = await signup(app, 'julie');
      const ws = await createWorkspace(julie);

      const selfRole = await http()
        .patch(`/api/workspaces/${ws.id}/members/${julie.id}`)
        .set('Cookie', julie.cookie)
        .send({ role: 'MEMBER' });
      expect(selfRole.status).toBe(403);
      const leave = await http()
        .delete(`/api/workspaces/${ws.id}/members/${julie.id}`)
        .set('Cookie', julie.cookie);
      expect(leave.status).toBe(403);
      expect((await members(julie, ws.id))[0]!.role).toBe('OWNER');
    });

    it("refuse d'attribuer le rôle OWNER", async () => {
      const julie = await signup(app, 'julie');
      const thomas = await signup(app, 'thomas');
      const ws = await createWorkspace(julie);
      await addMember(julie, ws.id, thomas, 'thomas');

      expect((await invite(julie, ws.id, 'zoe@test.be', 'OWNER')).status).toBe(400);
      const res = await http()
        .patch(`/api/workspaces/${ws.id}/members/${thomas.id}`)
        .set('Cookie', julie.cookie)
        .send({ role: 'OWNER' });
      expect(res.status).toBe(400);
    });

    it('la base refuse un second owner', async () => {
      const julie = await signup(app, 'julie');
      const thomas = await signup(app, 'thomas');
      const ws = await createWorkspace(julie);
      await expect(
        db
          .insert(workspaceMembers)
          .values({ workspaceId: ws.id, userId: thomas.id, role: 'OWNER' }),
      ).rejects.toThrow();
    });

    it('seul le owner change de plan ou supprime le workspace', async () => {
      const julie = await signup(app, 'julie');
      const thomas = await signup(app, 'thomas');
      const ws = await createWorkspace(julie);
      await addMember(julie, ws.id, thomas, 'thomas', 'ADMIN');

      const asAdmin = await http()
        .patch(`/api/workspaces/${ws.id}`)
        .set('Cookie', thomas.cookie)
        .send({ plan: 'PRO' });
      expect(asAdmin.status).toBe(403);
      // Un admin peut renommer
      const renamed = await http()
        .patch(`/api/workspaces/${ws.id}`)
        .set('Cookie', thomas.cookie)
        .send({ name: 'Nouveau nom' });
      expect(renamed.body).toMatchObject({ name: 'Nouveau nom', role: 'ADMIN' });
      expect(
        (await http().delete(`/api/workspaces/${ws.id}`).set('Cookie', thomas.cookie)).status,
      ).toBe(403);

      const upgraded = await http()
        .patch(`/api/workspaces/${ws.id}`)
        .set('Cookie', julie.cookie)
        .send({ plan: 'PRO' });
      expect(upgraded.body).toMatchObject({ plan: 'PRO', memberLimit: null });
      expect(
        (await http().delete(`/api/workspaces/${ws.id}`).set('Cookie', julie.cookie)).status,
      ).toBe(204);
      expect(await db.select().from(workspaces)).toEqual([]);
    });
  });

  describe('invitations', () => {
    it("seule la personne invitée peut accepter ou refuser l'invitation", async () => {
      const julie = await signup(app, 'julie');
      const eve = await signup(app, 'eve');
      const thomas = await signup(app, 'thomas');
      const ws = await createWorkspace(julie);
      const inv = await invite(julie, ws.id, 'thomas@test.be');

      const stolen = await http()
        .post(`/api/invitations/${inv.body.id}/accept`)
        .set('Cookie', eve.cookie);
      expect(stolen.status).toBe(404);
      expect(
        (await http().delete(`/api/invitations/${inv.body.id}`).set('Cookie', eve.cookie)).status,
      ).toBe(404);

      const declined = await http()
        .delete(`/api/invitations/${inv.body.id}`)
        .set('Cookie', thomas.cookie);
      expect(declined.status).toBe(204);
      expect(await db.select().from(workspaceInvitations)).toEqual([]);
    });

    it('refuse une invitation expirée', async () => {
      const julie = await signup(app, 'julie');
      const thomas = await signup(app, 'thomas');
      const ws = await createWorkspace(julie);
      const inv = await invite(julie, ws.id, 'thomas@test.be');
      await db
        .update(workspaceInvitations)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(workspaceInvitations.id, inv.body.id));

      const res = await http()
        .post(`/api/invitations/${inv.body.id}/accept`)
        .set('Cookie', thomas.cookie);
      expect(res.status).toBe(404);
    });

    it("refuse d'inviter un membre existant et remplace une invitation en double", async () => {
      const julie = await signup(app, 'julie');
      const ws = await createWorkspace(julie);

      const self = await invite(julie, ws.id, 'julie@test.be');
      expect(self.status).toBe(409);
      expect(self.body.fieldErrors.email).toBeDefined();

      await invite(julie, ws.id, 'zoe@test.be');
      const again = await invite(julie, ws.id, 'zoe@test.be', 'ADMIN');
      expect(again.status).toBe(201);
      const list = await http()
        .get(`/api/workspaces/${ws.id}/invitations`)
        .set('Cookie', julie.cookie);
      expect(list.body).toEqual([expect.objectContaining({ email: 'zoe@test.be', role: 'ADMIN' })]);
    });

    it('un admin peut révoquer une invitation', async () => {
      const julie = await signup(app, 'julie');
      const thomas = await signup(app, 'thomas');
      const ws = await createWorkspace(julie);
      const inv = await invite(julie, ws.id, 'thomas@test.be');

      const revoked = await http()
        .delete(`/api/workspaces/${ws.id}/invitations/${inv.body.id}`)
        .set('Cookie', julie.cookie);
      expect(revoked.status).toBe(204);
      const res = await http()
        .post(`/api/invitations/${inv.body.id}/accept`)
        .set('Cookie', thomas.cookie);
      expect(res.status).toBe(404);
    });
  });

  describe('quotas du plan', () => {
    /** Membres insérés en base : ils n'ont pas besoin de se connecter. */
    async function fillWorkspace(workspaceId: string, count: number) {
      const extra = await db
        .insert(users)
        .values(
          Array.from({ length: count }, (_, i) => ({
            email: `membre${i}@test.be`,
            displayName: `Membre ${i}`,
            passwordHash: 'x',
          })),
        )
        .returning();
      await db
        .insert(workspaceMembers)
        .values(extra.map((u) => ({ workspaceId, userId: u.id, role: 'MEMBER' as const })));
    }

    it('un workspace Free est limité à 10 membres, invitations en attente comprises', async () => {
      const julie = await signup(app, 'julie');
      const ws = await createWorkspace(julie);
      await fillWorkspace(ws.id, 8); // 9 membres

      expect((await invite(julie, ws.id, 'dixieme@test.be')).status).toBe(201);
      const full = await invite(julie, ws.id, 'onzieme@test.be');
      expect(full.status).toBe(403);
      expect(full.body.message).toBe('Votre plan Free est limité à 10 membres — passez à Pro.');

      // Passer à Pro lève la limite
      await http()
        .patch(`/api/workspaces/${ws.id}`)
        .set('Cookie', julie.cookie)
        .send({ plan: 'PRO' });
      expect((await invite(julie, ws.id, 'onzieme@test.be')).status).toBe(201);
    });

    it("revérifie le quota à l'acceptation", async () => {
      const julie = await signup(app, 'julie');
      const thomas = await signup(app, 'thomas');
      const ws = await createWorkspace(julie);
      const inv = await invite(julie, ws.id, 'thomas@test.be');
      await fillWorkspace(ws.id, 9); // le workspace est plein entre-temps

      const res = await http()
        .post(`/api/invitations/${inv.body.id}/accept`)
        .set('Cookie', thomas.cookie);
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/limité à 10 membres/);
    });

    it('refuse de repasser en Free au-delà du quota', async () => {
      const julie = await signup(app, 'julie');
      const ws = await createWorkspace(julie);
      await http()
        .patch(`/api/workspaces/${ws.id}`)
        .set('Cookie', julie.cookie)
        .send({ plan: 'PRO' });
      await fillWorkspace(ws.id, 10); // 11 membres

      const res = await http()
        .patch(`/api/workspaces/${ws.id}`)
        .set('Cookie', julie.cookie)
        .send({ plan: 'FREE' });
      expect(res.status).toBe(409);
    });
  });

  it('un membre retiré perd l’accès aux conversations du workspace', async () => {
    const julie = await signup(app, 'julie');
    const thomas = await signup(app, 'thomas');
    const ws = await createWorkspace(julie);
    await addMember(julie, ws.id, thomas, 'thomas');
    const [conv] = await db
      .insert(conversations)
      .values({ workspaceId: ws.id, type: 'GROUP', name: 'général' })
      .returning();
    await db.insert(participants).values([
      { conversationId: conv!.id, userId: julie.id },
      { conversationId: conv!.id, userId: thomas.id },
    ]);
    expect(
      (await http().get(`/api/conversations/${conv!.id}/messages`).set('Cookie', thomas.cookie))
        .status,
    ).toBe(200);

    await http()
      .delete(`/api/workspaces/${ws.id}/members/${thomas.id}`)
      .set('Cookie', julie.cookie);

    expect(
      (await http().get(`/api/conversations/${conv!.id}/messages`).set('Cookie', thomas.cookie))
        .status,
    ).toBe(403);
    const list = await http().get('/api/conversations').set('Cookie', thomas.cookie);
    expect(list.body).toEqual([]);
  });
});
