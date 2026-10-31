import type { ConversationListItemDto, MessageDto, SendMessageAck } from '@bozochat/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { and, eq } from 'drizzle-orm';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/db/client';
import { messages, participants } from '../src/db/schema';
import {
  createConversation,
  createTestApp,
  resetDb,
  signup,
  TEST_ORIGIN,
  type TestUser,
} from './helpers';

type Notification = { conversationId: string; message: MessageDto };

/**
 * Non-lus et notifications. Les compteurs viennent de `participants.lastReadAt` et des messages :
 * `notification:new` n'est qu'un signal, jamais une source de vérité.
 */
describe('Notifications et non-lus (e2e)', () => {
  let app: NestExpressApplication;
  let db: Database;
  let url: string;
  let alice: TestUser;
  let bob: TestUser;
  let eve: TestUser;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    ({ app, db } = await createTestApp());
    await app.listen(0);
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    await resetDb(db);
    alice = await signup(app, 'alice');
    bob = await signup(app, 'bob');
    eve = await signup(app, 'eve');
  });
  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await app.close();
  });

  /** Résout une fois la connexion établie : la room personnelle est alors rejointe. */
  async function connect(user: TestUser) {
    const socket = io(url, {
      transports: ['websocket'],
      extraHeaders: { cookie: user.cookie, origin: TEST_ORIGIN },
      reconnection: false,
    });
    sockets.push(socket);
    await new Promise<void>((resolve) => socket.once('connect', () => resolve()));
    return socket;
  }

  /** Résout avec la notification reçue, ou 'silence' si rien n'arrive dans le délai imparti. */
  const nextNotification = (socket: Socket, ms = 400) =>
    Promise.race([
      new Promise<Notification>((resolve) => socket.once('notification:new', resolve)),
      new Promise<'silence'>((resolve) => setTimeout(() => resolve('silence'), ms)),
    ]);

  const postMessage = (conversationId: string, user: TestUser, content: string) =>
    request(app.getHttpServer())
      .post(`/api/conversations/${conversationId}/messages`)
      .set('Cookie', user.cookie)
      .send({ content });

  const markRead = (conversationId: string, user: TestUser) =>
    request(app.getHttpServer())
      .post(`/api/conversations/${conversationId}/read`)
      .set('Cookie', user.cookie);

  async function unreadCount(conversationId: string, user: TestUser) {
    const res = await request(app.getHttpServer())
      .get('/api/conversations')
      .set('Cookie', user.cookie);
    const conversation = (res.body as ConversationListItemDto[]).find(
      (c) => c.id === conversationId,
    );
    return conversation?.unreadCount;
  }

  const lastReadAt = async (conversationId: string, user: TestUser) => {
    const row = await db.query.participants.findFirst({
      where: and(eq(participants.conversationId, conversationId), eq(participants.userId, user.id)),
    });
    return row!.lastReadAt.getTime();
  };

  describe('notification:new', () => {
    it("notifie les autres participants sans room ouverte, jamais l'auteur ni un tiers", async () => {
      const conv = await createConversation(db, [alice, bob], [eve]);
      const [aliceSocket, bobSocket, eveSocket] = await Promise.all([
        connect(alice),
        connect(bob),
        connect(eve),
      ]);

      const bobReceives = nextNotification(bobSocket);
      const aliceReceives = nextNotification(aliceSocket);
      const eveReceives = nextNotification(eveSocket);
      const ack = await new Promise<SendMessageAck>((resolve) =>
        aliceSocket.emit(
          'message:send',
          { conversationId: conv.id, content: 'Tu es là ?' },
          resolve,
        ),
      );
      expect(ack.ok).toBe(true);

      expect(await bobReceives).toMatchObject({
        conversationId: conv.id,
        message: { content: 'Tu es là ?', author: { id: alice.id, displayName: 'alice' } },
      });
      expect(await aliceReceives).toBe('silence');
      expect(await eveReceives).toBe('silence');
    });

    it('notifie aussi les envois REST, et tous les onglets du destinataire', async () => {
      const conv = await createConversation(db, [alice, bob]);
      const [firstTab, secondTab] = await Promise.all([connect(bob), connect(bob)]);

      const received = Promise.all([nextNotification(firstTab), nextNotification(secondTab)]);
      expect((await postMessage(conv.id, alice, 'Par REST')).status).toBe(201);

      const [first, second] = await received;
      expect(first).toMatchObject({ conversationId: conv.id, message: { content: 'Par REST' } });
      expect(second).toMatchObject({ conversationId: conv.id, message: { content: 'Par REST' } });
    });

    it('ne diffuse rien quand l’auteur est seul dans la conversation', async () => {
      const conv = await createConversation(db, [alice]);
      const [aliceSocket, bobSocket] = await Promise.all([connect(alice), connect(bob)]);

      const aliceReceives = nextNotification(aliceSocket);
      const bobReceives = nextNotification(bobSocket);
      expect((await postMessage(conv.id, alice, 'Note pour moi')).status).toBe(201);

      expect(await aliceReceives).toBe('silence');
      expect(await bobReceives).toBe('silence');
    });

    it("n'émet rien quand l'envoi est refusé", async () => {
      const conv = await createConversation(db, [alice, bob], [eve]);
      const bobSocket = await connect(bob);

      const bobReceives = nextNotification(bobSocket);
      expect((await postMessage(conv.id, eve, 'Intrusion')).status).toBe(403);
      expect(await bobReceives).toBe('silence');
    });
  });

  describe('unreadCount', () => {
    it('vaut 0 pour une conversation sans message', async () => {
      const conv = await createConversation(db, [alice, bob]);
      expect(await unreadCount(conv.id, bob)).toBe(0);
    });

    it("compte les messages des autres, jamais ceux de l'utilisateur", async () => {
      const conv = await createConversation(db, [alice, bob]);
      await postMessage(conv.id, alice, 'Un');
      await postMessage(conv.id, alice, 'Deux');
      await postMessage(conv.id, bob, 'Réponse');

      expect(await unreadCount(conv.id, bob)).toBe(2);
      expect(await unreadCount(conv.id, alice)).toBe(1);
    });

    it('sépare les compteurs de chaque conversation', async () => {
      const first = await createConversation(db, [alice, bob]);
      const second = await createConversation(db, [alice, bob]);
      await postMessage(first.id, alice, 'Un');
      await postMessage(second.id, alice, 'Deux');
      await postMessage(second.id, alice, 'Trois');

      expect(await unreadCount(first.id, bob)).toBe(1);
      expect(await unreadCount(second.id, bob)).toBe(2);
    });

    it('vient de la base : aucun socket connecté pendant les envois', async () => {
      const conv = await createConversation(db, [alice, bob]);
      await postMessage(conv.id, alice, 'Pendant que tu es hors ligne');
      await postMessage(conv.id, alice, 'Toujours hors ligne');

      expect(await unreadCount(conv.id, bob)).toBe(2);
    });

    it('ignore les messages supprimés', async () => {
      const conv = await createConversation(db, [alice, bob]);
      const kept = await postMessage(conv.id, alice, 'Gardé');
      const removed = await postMessage(conv.id, alice, 'Supprimé');
      expect(kept.status).toBe(201);
      await db
        .update(messages)
        .set({ deletedAt: new Date() })
        .where(eq(messages.id, (removed.body as MessageDto).id));

      expect(await unreadCount(conv.id, bob)).toBe(1);
    });

    it("compte les messages d'un auteur dont le compte a été supprimé", async () => {
      const conv = await createConversation(db, [alice, bob]);
      const res = await postMessage(conv.id, alice, 'Auteur disparu');
      await db
        .update(messages)
        .set({ authorId: null })
        .where(eq(messages.id, (res.body as MessageDto).id));

      expect(await unreadCount(conv.id, bob)).toBe(1);
    });
  });

  describe('POST /conversations/:id/read', () => {
    it('remet le compteur à zéro, sans corps de réponse', async () => {
      const conv = await createConversation(db, [alice, bob]);
      await postMessage(conv.id, alice, 'Un');
      await postMessage(conv.id, alice, 'Deux');
      expect(await unreadCount(conv.id, bob)).toBe(2);

      const res = await markRead(conv.id, bob);
      expect(res.status).toBe(204);
      expect(res.text).toBe('');
      expect(await unreadCount(conv.id, bob)).toBe(0);
    });

    it('recompte un message arrivé après le marquage', async () => {
      const conv = await createConversation(db, [alice, bob]);
      await postMessage(conv.id, alice, 'Lu');
      await markRead(conv.id, bob);
      await postMessage(conv.id, alice, 'Nouveau');

      expect(await unreadCount(conv.id, bob)).toBe(1);
    });

    it('ne modifie que la ligne de cet utilisateur et cette conversation', async () => {
      const conv = await createConversation(db, [alice, bob]);
      const other = await createConversation(db, [alice, bob]);
      await postMessage(conv.id, bob, 'Pour alice');
      await postMessage(other.id, alice, 'Pour bob ailleurs');
      const aliceBefore = await lastReadAt(conv.id, alice);
      const otherBefore = await lastReadAt(other.id, bob);

      expect((await markRead(conv.id, bob)).status).toBe(204);

      expect(await lastReadAt(conv.id, alice)).toBe(aliceBefore);
      expect(await lastReadAt(other.id, bob)).toBe(otherBefore);
      expect(await unreadCount(conv.id, alice)).toBe(1);
      expect(await unreadCount(other.id, bob)).toBe(1);
    });

    it('reste idempotent', async () => {
      const conv = await createConversation(db, [alice, bob]);
      await postMessage(conv.id, alice, 'Un');
      expect((await markRead(conv.id, bob)).status).toBe(204);
      expect((await markRead(conv.id, bob)).status).toBe(204);
      expect(await unreadCount(conv.id, bob)).toBe(0);
    });

    it("refuse un non-participant (403 générique) sans créer d'appartenance", async () => {
      const conv = await createConversation(db, [alice, bob], [eve]);
      const res = await markRead(conv.id, eve);
      expect(res.status).toBe(403);
      expect((res.body as { message: string }).message).toBe(
        "Vous n'avez pas accès à cette conversation.",
      );
      expect(
        await db.query.participants.findFirst({
          where: and(eq(participants.conversationId, conv.id), eq(participants.userId, eve.id)),
        }),
      ).toBeUndefined();
    });

    it('répond de la même façon pour une conversation inexistante', async () => {
      const res = await markRead('00000000-0000-4000-8000-000000000000', eve);
      expect(res.status).toBe(403);
    });

    it('exige une session et un identifiant valide', async () => {
      const conv = await createConversation(db, [alice, bob]);
      const anonymous = await request(app.getHttpServer()).post(
        `/api/conversations/${conv.id}/read`,
      );
      expect(anonymous.status).toBe(401);
      expect((await markRead('pas-un-uuid', bob)).status).toBe(400);
    });
  });
});
