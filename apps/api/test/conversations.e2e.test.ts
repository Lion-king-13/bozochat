import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ConversationListItemDto } from '@bozochat/shared';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '../src/db/client';
import { workspaceMembers, workspaces } from '../src/db/schema';
import { createTestApp, resetDb, signup, TEST_ORIGIN, type TestUser } from './helpers';

/**
 * F3, F4, F9 : conversations 1:1, groupes, participants et rôles.
 * Scénario de validation : un utilisateur crée un DM et un groupe, puis administre les
 * participants selon ses droits ; une personne retirée perd tout accès, API comme temps réel.
 */
describe('Conversations et groupes (e2e)', () => {
  let app: NestExpressApplication;
  let db: Database;
  let url: string;
  const sockets: Socket[] = [];

  // Une application par test : les compteurs de limitation de débit (inscription) repartent de zéro.
  beforeEach(async () => {
    ({ app, db } = await createTestApp());
    await resetDb(db);
    await app.listen(0);
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    sockets.splice(0).forEach((s) => s.disconnect());
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  /** Workspace dont `owner` est propriétaire et `members` simples membres. */
  async function createWorkspace(owner: TestUser, members: TestUser[]) {
    const [workspace] = await db
      .insert(workspaces)
      .values({ name: 'Agence', slug: `agence-${randomUUID()}` })
      .returning();
    await db
      .insert(workspaceMembers)
      .values([
        { workspaceId: workspace!.id, userId: owner.id, role: 'OWNER' as const },
        ...members.map((m) => ({ workspaceId: workspace!.id, userId: m.id })),
      ]);
    return workspace!.id;
  }

  async function createGroup(actor: TestUser, workspaceId: string, others: TestUser[]) {
    const res = await http()
      .post('/api/conversations/group')
      .set('Cookie', actor.cookie)
      .send({ workspaceId, name: 'Projet Orion', participantIds: others.map((o) => o.id) })
      .expect(201);
    return res.body as ConversationListItemDto;
  }

  async function roleOf(viewer: TestUser, conversationId: string, userId: string) {
    const res = await http().get('/api/conversations').set('Cookie', viewer.cookie).expect(200);
    const conversation = (res.body as ConversationListItemDto[]).find(
      (c) => c.id === conversationId,
    );
    return conversation?.participants.find((p) => p.id === userId)?.role;
  }

  function connect(user: TestUser) {
    const socket = io(url, {
      transports: ['websocket'],
      extraHeaders: { cookie: user.cookie, origin: TEST_ORIGIN },
      reconnection: false,
    });
    sockets.push(socket);
    return socket;
  }

  function join(socket: Socket, conversationId: string) {
    return new Promise<{ ok: boolean }>((resolve) => {
      const emit = () => socket.emit('conversation:join', { conversationId }, resolve);
      if (socket.connected) emit();
      else socket.once('connect', emit);
    });
  }

  describe('conversation 1:1 (F3)', () => {
    it('crée la conversation puis renvoie la même, quel que soit celui qui l’ouvre', async () => {
      const alice = await signup(app, 'alice');
      const bob = await signup(app, 'bob');
      const workspaceId = await createWorkspace(alice, [bob]);

      const first = await http()
        .post('/api/conversations/direct')
        .set('Cookie', alice.cookie)
        .send({ workspaceId, userId: bob.id })
        .expect(201);
      const again = await http()
        .post('/api/conversations/direct')
        .set('Cookie', bob.cookie)
        .send({ workspaceId, userId: alice.id })
        .expect(200);

      const conversation = first.body as ConversationListItemDto;
      expect(conversation.type).toBe('DIRECT');
      expect(conversation.name).toBeNull();
      expect(conversation.participants.map((p) => p.id).sort()).toEqual([alice.id, bob.id].sort());
      expect((again.body as ConversationListItemDto).id).toBe(conversation.id);
    });

    it('ne crée jamais de doublon, même avec des ouvertures simultanées', async () => {
      const alice = await signup(app, 'alice');
      const bob = await signup(app, 'bob');
      const workspaceId = await createWorkspace(alice, [bob]);

      const responses = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          http()
            .post('/api/conversations/direct')
            .set('Cookie', i % 2 ? alice.cookie : bob.cookie)
            .send({ workspaceId, userId: i % 2 ? bob.id : alice.id }),
        ),
      );

      const ids = new Set(responses.map((r) => (r.body as ConversationListItemDto).id));
      expect(ids.size).toBe(1);
      expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    });

    it('refuse une conversation avec soi-même ou hors du workspace', async () => {
      const alice = await signup(app, 'alice');
      const eve = await signup(app, 'eve');
      const workspaceId = await createWorkspace(alice, []);

      const self = await http()
        .post('/api/conversations/direct')
        .set('Cookie', alice.cookie)
        .send({ workspaceId, userId: alice.id })
        .expect(400);
      expect(self.body.message).toBe(
        'Vous ne pouvez pas démarrer une conversation avec vous-même.',
      );

      await http()
        .post('/api/conversations/direct')
        .set('Cookie', alice.cookie)
        .send({ workspaceId, userId: eve.id })
        .expect(400);
      await http()
        .post('/api/conversations/direct')
        .set('Cookie', eve.cookie)
        .send({ workspaceId, userId: alice.id })
        .expect(403);
    });

    it('une conversation privée ne se renomme pas et ne se quitte pas', async () => {
      const alice = await signup(app, 'alice');
      const bob = await signup(app, 'bob');
      const workspaceId = await createWorkspace(alice, [bob]);
      const { body } = await http()
        .post('/api/conversations/direct')
        .set('Cookie', alice.cookie)
        .send({ workspaceId, userId: bob.id });
      const id = (body as ConversationListItemDto).id;

      await http()
        .patch(`/api/conversations/${id}`)
        .set('Cookie', alice.cookie)
        .send({ name: 'X' })
        .expect(403);
      await http()
        .delete(`/api/conversations/${id}/participants/${bob.id}`)
        .set('Cookie', alice.cookie)
        .expect(403);
    });
  });

  describe('groupes (F4)', () => {
    it('le créateur est admin, les autres membres, le nom est nettoyé', async () => {
      const alice = await signup(app, 'alice');
      const bob = await signup(app, 'bob');
      const workspaceId = await createWorkspace(alice, [bob]);

      const res = await http()
        .post('/api/conversations/group')
        .set('Cookie', alice.cookie)
        .send({ workspaceId, name: '  Projet Orion  ', participantIds: [bob.id, bob.id, alice.id] })
        .expect(201);
      const group = res.body as ConversationListItemDto;

      expect(group.type).toBe('GROUP');
      expect(group.name).toBe('Projet Orion');
      expect(group.participants).toHaveLength(2);
      expect(group.participants.find((p) => p.id === alice.id)?.role).toBe('ADMIN');
      expect(group.participants.find((p) => p.id === bob.id)?.role).toBe('MEMBER');
    });

    it('valide les entrées avec des messages compréhensibles', async () => {
      const alice = await signup(app, 'alice');
      const eve = await signup(app, 'eve');
      const workspaceId = await createWorkspace(alice, []);

      const empty = await http()
        .post('/api/conversations/group')
        .set('Cookie', alice.cookie)
        .send({ workspaceId, name: '   ', participantIds: [eve.id] })
        .expect(400);
      expect(empty.body.fieldErrors?.name).toBe('Le nom du groupe est obligatoire.');

      await http()
        .post('/api/conversations/group')
        .set('Cookie', alice.cookie)
        .send({ workspaceId, name: 'Solo', participantIds: [alice.id] })
        .expect(400);
      await http()
        .post('/api/conversations/group')
        .set('Cookie', alice.cookie)
        .send({ workspaceId, name: 'Fuite', participantIds: [eve.id] })
        .expect(400);
    });

    it("seul l'admin renomme, ajoute et change les rôles", async () => {
      const alice = await signup(app, 'alice');
      const bob = await signup(app, 'bob');
      const carol = await signup(app, 'carol');
      const workspaceId = await createWorkspace(alice, [bob, carol]);
      const group = await createGroup(alice, workspaceId, [bob]);
      const base = `/api/conversations/${group.id}`;

      await http().patch(base).set('Cookie', bob.cookie).send({ name: 'Pirate' }).expect(403);
      await http()
        .post(`${base}/participants`)
        .set('Cookie', bob.cookie)
        .send({ userIds: [carol.id] })
        .expect(403);
      await http()
        .patch(`${base}/participants/${bob.id}`)
        .set('Cookie', bob.cookie)
        .send({ role: 'ADMIN' })
        .expect(403);

      await http().patch(base).set('Cookie', alice.cookie).send({ name: 'Orion v2' }).expect(204);
      await http()
        .post(`${base}/participants`)
        .set('Cookie', alice.cookie)
        .send({ userIds: [carol.id] })
        .expect(204);
      await http()
        .patch(`${base}/participants/${bob.id}`)
        .set('Cookie', alice.cookie)
        .send({ role: 'ADMIN' })
        .expect(204);

      expect(await roleOf(carol, group.id, carol.id)).toBe('MEMBER');
      expect(await roleOf(carol, group.id, bob.id)).toBe('ADMIN');
    });

    it('un admin du workspace modère un groupe dont il ne fait pas partie', async () => {
      const owner = await signup(app, 'owner');
      const bob = await signup(app, 'bob');
      const carol = await signup(app, 'carol');
      const workspaceId = await createWorkspace(owner, [bob, carol]);
      const group = await createGroup(bob, workspaceId, [carol]);

      await http()
        .delete(`/api/conversations/${group.id}/participants/${carol.id}`)
        .set('Cookie', owner.cookie)
        .expect(204);
      // Modérer n'est pas lire : il n'a toujours pas accès aux messages.
      await http()
        .get(`/api/conversations/${group.id}/messages`)
        .set('Cookie', owner.cookie)
        .expect(403);
    });

    it('le groupe garde toujours un admin', async () => {
      const alice = await signup(app, 'alice');
      const bob = await signup(app, 'bob');
      const carol = await signup(app, 'carol');
      const workspaceId = await createWorkspace(alice, [bob, carol]);
      const group = await createGroup(alice, workspaceId, [bob, carol]);
      const base = `/api/conversations/${group.id}`;

      const demote = await http()
        .patch(`${base}/participants/${alice.id}`)
        .set('Cookie', alice.cookie)
        .send({ role: 'MEMBER' })
        .expect(400);
      expect(demote.body.message).toBe('Le groupe doit garder au moins un administrateur.');

      // Le dernier admin quitte : le participant le plus ancien prend le relais.
      await http()
        .delete(`${base}/participants/${alice.id}`)
        .set('Cookie', alice.cookie)
        .expect(204);
      expect(await roleOf(bob, group.id, bob.id)).toBe('ADMIN');
    });

    it('un groupe vidé de tous ses participants est supprimé', async () => {
      const alice = await signup(app, 'alice');
      const bob = await signup(app, 'bob');
      const workspaceId = await createWorkspace(alice, [bob]);
      const group = await createGroup(alice, workspaceId, [bob]);
      const base = `/api/conversations/${group.id}`;

      await http().delete(`${base}/participants/${bob.id}`).set('Cookie', bob.cookie).expect(204);
      await http()
        .delete(`${base}/participants/${alice.id}`)
        .set('Cookie', alice.cookie)
        .expect(204);

      const after = await db.query.conversations.findFirst({
        where: (c, { eq }) => eq(c.id, group.id),
      });
      expect(after).toBeUndefined();
    });
  });

  describe('permissions après retrait (F9)', () => {
    it('la personne retirée perd l’accès en API et ne reçoit plus rien en temps réel', async () => {
      const alice = await signup(app, 'alice');
      const bob = await signup(app, 'bob');
      const workspaceId = await createWorkspace(alice, [bob]);
      const group = await createGroup(alice, workspaceId, [bob]);
      const base = `/api/conversations/${group.id}`;

      const bobSocket = connect(bob);
      expect((await join(bobSocket, group.id)).ok).toBe(true);
      const removed = new Promise<{ conversationId: string }>((resolve) =>
        bobSocket.once('conversation:removed', resolve),
      );
      const received: unknown[] = [];
      bobSocket.on('message:new', (m) => received.push(m));

      await http().delete(`${base}/participants/${bob.id}`).set('Cookie', alice.cookie).expect(204);
      expect(await removed).toEqual({ conversationId: group.id });

      await http()
        .post(`${base}/messages`)
        .set('Cookie', alice.cookie)
        .send({ content: 'Secret' })
        .expect(201);
      await new Promise((r) => setTimeout(r, 200));
      expect(received).toHaveLength(0);

      await http().get(`${base}/messages`).set('Cookie', bob.cookie).expect(403);
      await http()
        .post(`${base}/messages`)
        .set('Cookie', bob.cookie)
        .send({ content: 'Coucou' })
        .expect(403);
      expect((await join(bobSocket, group.id)).ok).toBe(false);
    });

    it('prévient les participants en temps réel quand le groupe change', async () => {
      const alice = await signup(app, 'alice');
      const bob = await signup(app, 'bob');
      const workspaceId = await createWorkspace(alice, [bob]);
      const bobSocket = connect(bob);
      await new Promise<void>((resolve) => bobSocket.once('connect', () => resolve()));

      const created = new Promise<{ conversationId: string }>((resolve) =>
        bobSocket.once('conversation:updated', resolve),
      );
      const group = await createGroup(alice, workspaceId, [bob]);
      expect(await created).toEqual({ conversationId: group.id });

      const renamed = new Promise((resolve) => bobSocket.once('conversation:updated', resolve));
      await http()
        .patch(`/api/conversations/${group.id}`)
        .set('Cookie', alice.cookie)
        .send({ name: 'Nouveau' });
      await expect(renamed).resolves.toEqual({ conversationId: group.id });
    });
  });
});
