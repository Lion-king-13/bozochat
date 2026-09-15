import type { NestExpressApplication } from '@nestjs/platform-express';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '../src/db/client';
import { conversations, participants, workspaceMembers, workspaces } from '../src/db/schema';
import { createTestApp, resetDb, TEST_ORIGIN } from './helpers';

/**
 * Règle d'or : un non-participant ne peut pas s'abonner aux messages d'une conversation.
 */
describe('Permissions temps réel (e2e)', () => {
  let app: NestExpressApplication;
  let db: Database;
  let url: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    ({ app, db } = await createTestApp());
    await app.listen(0);
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });
  beforeEach(() => resetDb(db));
  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await app.close();
  });

  async function signup(name: string) {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: `${name}@test.be`, displayName: name, password: 'motdepasse' });
    const cookie = String(res.headers['set-cookie']?.[0]).split(';')[0]!;
    return { user: res.body as { id: string }, cookie };
  }

  function connect(cookie?: string) {
    const socket = io(url, {
      transports: ['websocket'],
      extraHeaders: { ...(cookie ? { cookie } : {}), origin: TEST_ORIGIN },
      reconnection: false,
    });
    sockets.push(socket);
    return socket;
  }

  const join = (socket: Socket, conversationId: string) =>
    new Promise<{ ok: boolean; error?: { statusCode: number } }>((resolve) => {
      const emit = () => socket.emit('conversation:join', { conversationId }, resolve);
      if (socket.connected) emit();
      else socket.once('connect', emit);
    });

  it('refuse une connexion WebSocket sans session', async () => {
    const socket = connect();
    const error = await new Promise<Error>((resolve) => socket.on('connect_error', resolve));
    expect(error.message).toBe('Vous devez être connecté.');
    expect(socket.connected).toBe(false);
  });

  it('autorise un participant et refuse un non-participant', async () => {
    const alice = await signup('alice');
    const bob = await signup('bob');
    const eve = await signup('eve');

    const [ws] = await db.insert(workspaces).values({ name: 'Test', slug: 'test' }).returning();
    await db
      .insert(workspaceMembers)
      .values([alice, bob, eve].map((p) => ({ workspaceId: ws!.id, userId: p.user.id })));
    const [conv] = await db
      .insert(conversations)
      .values({ workspaceId: ws!.id, type: 'DIRECT' })
      .returning();
    await db.insert(participants).values([
      { conversationId: conv!.id, userId: alice.user.id },
      { conversationId: conv!.id, userId: bob.user.id },
    ]);

    expect(await join(connect(alice.cookie), conv!.id)).toEqual({ ok: true });

    const denied = await join(connect(eve.cookie), conv!.id);
    expect(denied.ok).toBe(false);
    expect(denied.error?.statusCode).toBe(403);
  });
});
