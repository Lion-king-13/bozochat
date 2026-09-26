import type { MessageDto, MessagePageDto } from '@bozochat/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/db/client';
import { conversations, messages } from '../src/db/schema';
import { createConversation, createTestApp, resetDb, signup, type TestUser } from './helpers';

/**
 * API REST des messages. Les comptes sont créés une seule fois : `/auth/register` est
 * volontairement limité en débit, et chaque test travaille sur sa propre conversation.
 */
describe('Messages REST (e2e)', () => {
  let app: NestExpressApplication;
  let db: Database;
  let alice: TestUser;
  let bob: TestUser;
  let eve: TestUser;

  beforeAll(async () => {
    ({ app, db } = await createTestApp());
    await resetDb(db);
    alice = await signup(app, 'alice');
    bob = await signup(app, 'bob');
    eve = await signup(app, 'eve');
  });
  afterAll(() => app.close());

  const get = (path: string, user: TestUser) =>
    request(app.getHttpServer()).get(path).set('Cookie', user.cookie);
  const post = (path: string, user: TestUser, body: object) =>
    request(app.getHttpServer()).post(path).set('Cookie', user.cookie).send(body);

  it('exige une session', async () => {
    expect((await request(app.getHttpServer()).get('/api/conversations')).status).toBe(401);
  });

  it('ne liste que mes conversations, les plus actives en premier', async () => {
    const ancienne = await createConversation(db, [alice, bob], [eve]);
    const recente = await createConversation(db, [alice, bob]);
    const sansMoi = await createConversation(db, [bob, eve]);
    await db
      .update(conversations)
      .set({ lastMessageAt: new Date(Date.now() - 60 * 60 * 1000) })
      .where(eq(conversations.id, ancienne.id));

    const res = await get('/api/conversations', alice);
    expect(res.status).toBe(200);
    const ids = (res.body as { id: string }[]).map((c) => c.id);
    expect(ids).toContain(recente.id);
    expect(ids).toContain(ancienne.id);
    expect(ids).not.toContain(sansMoi.id);
    expect(ids.indexOf(recente.id)).toBeLessThan(ids.indexOf(ancienne.id));
    // Aucune adresse e-mail dans les participants exposés.
    expect(JSON.stringify(res.body)).not.toContain('@test.be');
  });

  it("autorise un participant à lire l'historique", async () => {
    const conv = await createConversation(db, [alice, bob], [eve]);
    await post(`/api/conversations/${conv.id}/messages`, alice, { content: 'Bonjour' });

    const res = await get(`/api/conversations/${conv.id}/messages`, bob);
    expect(res.status).toBe(200);
    const page = res.body as MessagePageDto;
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      content: 'Bonjour',
      conversationId: conv.id,
      deleted: false,
      author: { id: alice.id, displayName: 'alice' },
    });
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });

  it("refuse l'historique à un non-participant (403 générique)", async () => {
    const conv = await createConversation(db, [alice, bob], [eve]);
    const res = await get(`/api/conversations/${conv.id}/messages`, eve);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Vous n'avez pas accès à cette conversation.");
  });

  it('refuse un identifiant de conversation invalide', async () => {
    expect((await get('/api/conversations/pas-un-uuid/messages', alice)).status).toBe(400);
  });

  it('crée un message et met à jour lastMessageAt dans la même opération', async () => {
    const conv = await createConversation(db, [alice, bob]);
    const before = await db.query.conversations.findFirst({ where: eq(conversations.id, conv.id) });

    const res = await post(`/api/conversations/${conv.id}/messages`, alice, {
      content: '  Salut Bob  ',
    });
    expect(res.status).toBe(201);
    const message = res.body as MessageDto;
    expect(message.content).toBe('Salut Bob'); // trim appliqué par le schéma partagé
    expect(message.author).toEqual({ id: alice.id, displayName: 'alice', avatarUrl: null });

    const stored = await db.query.messages.findFirst({ where: eq(messages.id, message.id) });
    expect(stored?.content).toBe('Salut Bob');
    const after = await db.query.conversations.findFirst({ where: eq(conversations.id, conv.id) });
    expect(after!.lastMessageAt.getTime()).toBeGreaterThan(before!.lastMessageAt.getTime());
    expect(after!.lastMessageAt.getTime()).toBe(stored!.createdAt.getTime());
  });

  it("refuse l'envoi à un non-participant et n'écrit rien", async () => {
    const conv = await createConversation(db, [alice, bob], [eve]);
    const res = await post(`/api/conversations/${conv.id}/messages`, eve, { content: 'Coucou' });
    expect(res.status).toBe(403);
    expect(
      await db.query.messages.findFirst({ where: eq(messages.conversationId, conv.id) }),
    ).toBeUndefined();
  });

  it('refuse un message vide ou trop long', async () => {
    const conv = await createConversation(db, [alice, bob]);

    const vide = await post(`/api/conversations/${conv.id}/messages`, alice, { content: '   ' });
    expect(vide.status).toBe(400);
    expect(vide.body.fieldErrors.content).toBe('Le message ne peut pas être vide.');

    const tropLong = await post(`/api/conversations/${conv.id}/messages`, alice, {
      content: 'a'.repeat(4001),
    });
    expect(tropLong.status).toBe(400);
    expect(tropLong.body.fieldErrors.content).toBe(
      'Le message ne peut pas dépasser 4000 caractères.',
    );

    expect(
      await db.query.messages.findFirst({ where: eq(messages.conversationId, conv.id) }),
    ).toBeUndefined();
  });

  it('pagine sans doublon ni trou, même à horodatage identique', async () => {
    const conv = await createConversation(db, [alice, bob]);
    const now = Date.now();
    await db.insert(messages).values(
      // 11 horodatages de 5 messages : force le départage par id.
      Array.from({ length: 55 }, (_, i) => ({
        conversationId: conv.id,
        authorId: alice.id,
        content: `message ${i}`,
        createdAt: new Date(now - Math.floor(i / 5) * 60_000),
      })),
    );

    const first = (await get(`/api/conversations/${conv.id}/messages`, alice))
      .body as MessagePageDto;
    expect(first.items).toHaveLength(50); // 50 par défaut
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toBeTruthy();

    const second = (
      await get(`/api/conversations/${conv.id}/messages?cursor=${first.nextCursor}`, alice)
    ).body as MessagePageDto;
    expect(second.items).toHaveLength(5);
    expect(second.hasMore).toBe(false);
    expect(second.nextCursor).toBeNull();

    const ids = [...first.items, ...second.items].map((m) => m.id);
    expect(new Set(ids).size).toBe(55);
    // Ordre décroissant stable sur (createdAt, id).
    const dates = [...first.items, ...second.items].map((m) => Date.parse(m.createdAt));
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
  });

  it('respecte limit et refuse une limite hors bornes ou un curseur illisible', async () => {
    const conv = await createConversation(db, [alice, bob]);
    await db.insert(messages).values(
      Array.from({ length: 4 }, (_, i) => ({
        conversationId: conv.id,
        authorId: alice.id,
        content: `message ${i}`,
      })),
    );

    const limited = (await get(`/api/conversations/${conv.id}/messages?limit=2`, alice))
      .body as MessagePageDto;
    expect(limited.items).toHaveLength(2);
    expect(limited.hasMore).toBe(true);

    expect((await get(`/api/conversations/${conv.id}/messages?limit=101`, alice)).status).toBe(400);
    expect(
      (await get(`/api/conversations/${conv.id}/messages?cursor=nimportequoi`, alice)).status,
    ).toBe(400);
  });
});
