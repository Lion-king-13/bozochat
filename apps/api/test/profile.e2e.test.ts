import type { PublicUser } from '@bozochat/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/db/client';
import { users } from '../src/db/schema';
import { createConversation, createTestApp, resetDb, signup, type TestUser } from './helpers';

/**
 * Compte de l'utilisateur connecté. Les comptes sont créés une seule fois : `/auth/register`
 * est volontairement limité en débit, comme les routes qui vérifient un mot de passe.
 * Chaque groupe de tests travaille sur son propre utilisateur pour rester indépendant.
 */
describe('Profil (e2e)', () => {
  let app: NestExpressApplication;
  let db: Database;
  let alice: TestUser;
  let bob: TestUser;
  let carol: TestUser;
  let dave: TestUser;

  const PASSWORD = 'motdepasse';

  beforeAll(async () => {
    ({ app, db } = await createTestApp());
    await resetDb(db);
    alice = await signup(app, 'alice');
    bob = await signup(app, 'bob');
    carol = await signup(app, 'carol');
    dave = await signup(app, 'dave');
  });
  afterAll(() => app.close());

  const patch = (path: string, user: TestUser, body: object) =>
    request(app.getHttpServer()).patch(path).set('Cookie', user.cookie).send(body);
  const anonymous = (path: string, body: object) =>
    request(app.getHttpServer()).patch(path).send(body);
  const row = (id: string) => db.query.users.findFirst({ where: eq(users.id, id) });

  it('refuse toute modification sans session', async () => {
    expect((await anonymous('/api/users/me', { displayName: 'Pirate' })).status).toBe(401);
    expect(
      (await anonymous('/api/users/me/email', { email: 'x@test.be', currentPassword: PASSWORD }))
        .status,
    ).toBe(401);
    expect(
      (
        await anonymous('/api/users/me/password', {
          currentPassword: PASSWORD,
          newPassword: 'nouveaumotdepasse',
        })
      ).status,
    ).toBe(401);
    expect((await row(alice.id))?.displayName).toBe('alice');
  });

  it('met à jour le nom affiché et ne renvoie jamais le hash', async () => {
    const res = await patch('/api/users/me', alice, { displayName: '  Alice Martin  ' });
    expect(res.status).toBe(200);
    expect(res.body as PublicUser).toMatchObject({ id: alice.id, displayName: 'Alice Martin' });
    expect(res.body.passwordHash).toBeUndefined();
    expect((await row(alice.id))?.displayName).toBe('Alice Martin');
  });

  it('refuse un nom affiché invalide', async () => {
    const res = await patch('/api/users/me', alice, { displayName: 'A' });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors.displayName).toBe(
      'Le nom affiché doit contenir au moins 2 caractères.',
    );
    expect((await row(alice.id))?.displayName).toBe('Alice Martin');
  });

  it('enregistre une photo de profil puis la retire', async () => {
    const added = await patch('/api/users/me', alice, { avatarUrl: 'https://cdn.test/a.png' });
    expect(added.status).toBe(200);
    expect(added.body.avatarUrl).toBe('https://cdn.test/a.png');

    const removed = await patch('/api/users/me', alice, { avatarUrl: null });
    expect(removed.status).toBe(200);
    expect(removed.body.avatarUrl).toBeNull();
    expect((await row(alice.id))?.avatarUrl).toBeNull();
  });

  it('refuse une adresse de photo dans un protocole non http(s)', async () => {
    const res = await patch('/api/users/me', alice, { avatarUrl: 'javascript:alert(1)' });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors.avatarUrl).toBe("L'adresse de la photo n'est pas valide.");
  });

  it('ne touche qu’au compte connecté', async () => {
    const before = await row(bob.id);
    await patch('/api/users/me', alice, { displayName: 'Alice A.', avatarUrl: null });
    expect(await row(bob.id)).toEqual(before);
  });

  it('change l’e-mail avec le bon mot de passe, en le normalisant', async () => {
    const conversation = await createConversation(db, [carol, bob]);

    const res = await patch('/api/users/me/email', carol, {
      email: '  Carol.New@Orion.TEST ',
      currentPassword: PASSWORD,
    });
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('carol.new@orion.test');
    // L'UUID ne change pas : sessions, participations et messages restent rattachés au compte.
    expect(res.body.id).toBe(carol.id);

    const stored = await row(carol.id);
    expect(stored?.email).toBe('carol.new@orion.test');

    const conversations = await request(app.getHttpServer())
      .get('/api/conversations')
      .set('Cookie', carol.cookie);
    expect(conversations.status).toBe(200);
    expect((conversations.body as { id: string }[]).map((c) => c.id)).toContain(conversation.id);
  });

  it('refuse le changement d’e-mail avec un mauvais mot de passe', async () => {
    const res = await patch('/api/users/me/email', carol, {
      email: 'autre@orion.test',
      currentPassword: 'mauvais mot de passe',
    });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors.currentPassword).toBe('Le mot de passe actuel est incorrect.');
    expect((await row(carol.id))?.email).toBe('carol.new@orion.test');
  });

  it('refuse un e-mail déjà utilisé par un autre compte', async () => {
    const res = await patch('/api/users/me/email', carol, {
      email: 'bob@test.be',
      currentPassword: PASSWORD,
    });
    expect(res.status).toBe(409);
    expect(res.body.fieldErrors.email).toBe('Un compte existe déjà avec cette adresse e-mail.');
    expect((await row(carol.id))?.email).toBe('carol.new@orion.test');
    expect((await row(bob.id))?.email).toBe('bob@test.be');
  });

  it('refuse un e-mail invalide', async () => {
    const res = await patch('/api/users/me/email', carol, {
      email: 'pas-un-email',
      currentPassword: PASSWORD,
    });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors.email).toBe("L'adresse e-mail n'est pas valide.");
  });

  it('change le mot de passe, garde la session et invalide l’ancien', async () => {
    const wrong = await patch('/api/users/me/password', dave, {
      currentPassword: 'pas le bon',
      newPassword: 'nouveaumotdepasse',
    });
    expect(wrong.status).toBe(400);
    expect(wrong.body.fieldErrors.currentPassword).toBe('Le mot de passe actuel est incorrect.');

    const hashBefore = (await row(dave.id))?.passwordHash;
    const changed = await patch('/api/users/me/password', dave, {
      currentPassword: PASSWORD,
      newPassword: 'nouveaumotdepasse',
    });
    expect(changed.status).toBe(204);
    expect(changed.body).toEqual({});

    const stored = await row(dave.id);
    expect(stored?.passwordHash).not.toBe(hashBefore);
    expect(stored?.passwordHash).not.toContain('nouveaumotdepasse');

    // La session en cours reste valide : pas de déconnexion après un changement de mot de passe.
    const me = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', dave.cookie);
    expect(me.status).toBe(200);
    expect(me.body.id).toBe(dave.id);

    const old = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'dave@test.be', password: PASSWORD });
    expect(old.status).toBe(401);

    const fresh = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'dave@test.be', password: 'nouveaumotdepasse' });
    expect(fresh.status).toBe(200);
    expect(fresh.body.id).toBe(dave.id);
  });

  it('refuse un nouveau mot de passe trop court', async () => {
    const res = await patch('/api/users/me/password', dave, {
      currentPassword: 'nouveaumotdepasse',
      newPassword: '123',
    });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors.newPassword).toBe(
      'Le mot de passe doit contenir au moins 8 caractères.',
    );
  });
});
