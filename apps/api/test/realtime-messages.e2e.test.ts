import type { MessageDto, SendMessageAck } from '@bozochat/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { eq } from 'drizzle-orm';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/db/client';
import { messages } from '../src/db/schema';
import {
  createConversation,
  createTestApp,
  resetDb,
  signup,
  TEST_ORIGIN,
  type TestUser,
} from './helpers';

/**
 * Envoi de messages via Socket.IO : même service métier que le REST, donc mêmes permissions.
 * Un non-participant ne doit ni pouvoir écrire, ni recevoir `message:new`.
 */
describe('Messages temps réel (e2e)', () => {
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

  function connect(user: TestUser) {
    const socket = io(url, {
      transports: ['websocket'],
      extraHeaders: { cookie: user.cookie, origin: TEST_ORIGIN },
      reconnection: false,
    });
    sockets.push(socket);
    return socket;
  }

  const emit = <T>(socket: Socket, event: string, payload: unknown) =>
    new Promise<T>((resolve) => {
      const send = () => socket.emit(event, payload, resolve);
      if (socket.connected) send();
      else socket.once('connect', send);
    });

  const join = (socket: Socket, conversationId: string) =>
    emit<{ ok: boolean }>(socket, 'conversation:join', { conversationId });

  const send = (socket: Socket, conversationId: string, content: string) =>
    emit<SendMessageAck>(socket, 'message:send', { conversationId, content });

  /** Résout avec le message reçu, ou 'silence' si rien n'arrive dans le délai imparti. */
  const nextMessage = (socket: Socket, ms = 400) =>
    Promise.race([
      new Promise<MessageDto>((resolve) => socket.once('message:new', resolve)),
      new Promise<'silence'>((resolve) => setTimeout(() => resolve('silence'), ms)),
    ]);

  it('crée le message et le diffuse aux autres participants', async () => {
    const conv = await createConversation(db, [alice, bob], [eve]);
    const aliceSocket = connect(alice);
    const bobSocket = connect(bob);
    expect(await join(aliceSocket, conv.id)).toEqual({ ok: true });
    expect(await join(bobSocket, conv.id)).toEqual({ ok: true });

    const received = nextMessage(bobSocket);
    const ack = await send(aliceSocket, conv.id, 'Message temps réel');
    expect(ack.ok).toBe(true);
    const sent = (ack as { ok: true; message: MessageDto }).message;
    expect(sent).toMatchObject({
      conversationId: conv.id,
      content: 'Message temps réel',
      author: { id: alice.id },
    });

    expect(await received).toMatchObject({ id: sent.id, content: 'Message temps réel' });

    const stored = await db.query.messages.findFirst({ where: eq(messages.id, sent.id) });
    expect(stored?.content).toBe('Message temps réel');
    const conversation = await db.query.conversations.findFirst({
      where: (c, { eq: is }) => is(c.id, conv.id),
    });
    expect(conversation!.lastMessageAt.getTime()).toBe(stored!.createdAt.getTime());
  });

  it("refuse l'envoi d'un non-participant et ne lui diffuse rien", async () => {
    const conv = await createConversation(db, [alice, bob], [eve]);
    const aliceSocket = connect(alice);
    const eveSocket = connect(eve);
    await join(aliceSocket, conv.id);

    const refuseJoin = await join(eveSocket, conv.id);
    expect(refuseJoin.ok).toBe(false);

    const ack = await send(eveSocket, conv.id, 'Je ne devrais pas être là');
    expect(ack.ok).toBe(false);
    const error = (ack as { ok: false; error: { statusCode: number; message: string } }).error;
    expect(error.statusCode).toBe(403);
    expect(error.message).toBe("Vous n'avez pas accès à cette conversation.");
    expect(JSON.stringify(ack)).not.toMatch(/at .*\.ts/); // aucune trace technique
    expect(
      await db.query.messages.findFirst({ where: eq(messages.conversationId, conv.id) }),
    ).toBeUndefined();

    // Eve écoute pendant qu'Alice écrit : elle ne doit jamais recevoir message:new.
    const eveReceives = nextMessage(eveSocket);
    await send(aliceSocket, conv.id, 'Message privé');
    expect(await eveReceives).toBe('silence');
  });

  it('refuse un payload invalide avec une erreur par champ', async () => {
    const conv = await createConversation(db, [alice, bob]);
    const aliceSocket = connect(alice);
    await join(aliceSocket, conv.id);

    const ack = await send(aliceSocket, conv.id, '   ');
    expect(ack.ok).toBe(false);
    const error = (ack as { ok: false; error: { statusCode: number; fieldErrors?: object } }).error;
    expect(error.statusCode).toBe(400);
    expect(error.fieldErrors).toEqual({ content: 'Le message ne peut pas être vide.' });
  });
});
