import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '../src/db/client';
import { createTestApp, resetDb } from './helpers';

describe('Auth (e2e)', () => {
  let app: NestExpressApplication;
  let db: Database;

  beforeAll(async () => {
    ({ app, db } = await createTestApp());
  });
  beforeEach(() => resetDb(db));
  afterAll(() => app.close());

  const alice = { email: 'alice@test.be', displayName: 'Alice', password: 'motdepasse' };

  it('inscrit un utilisateur, pose un cookie httpOnly et ne renvoie pas le hash', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/register').send(alice);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email: 'alice@test.be', displayName: 'Alice' });
    expect(res.body.passwordHash).toBeUndefined();
    expect(res.headers['set-cookie']?.[0]).toMatch(/bozochat_sid=.+HttpOnly/);
  });

  it('renvoie des erreurs par champ lisibles', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'pas-un-email', displayName: 'A', password: '123' });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors).toEqual({
      email: "L'adresse e-mail n'est pas valide.",
      displayName: 'Le nom affiché doit contenir au moins 2 caractères.',
      password: 'Le mot de passe doit contenir au moins 8 caractères.',
    });
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.ts/); // pas de stack trace
  });

  it('refuse un e-mail déjà utilisé', async () => {
    await request(app.getHttpServer()).post('/api/auth/register').send(alice);
    const res = await request(app.getHttpServer()).post('/api/auth/register').send(alice);
    expect(res.status).toBe(409);
    expect(res.body.fieldErrors.email).toBeDefined();
  });

  it('connecte, lit /me puis déconnecte', async () => {
    await request(app.getHttpServer()).post('/api/auth/register').send(alice);
    const agent = request.agent(app.getHttpServer());

    const bad = await agent.post('/api/auth/login').send({ ...alice, password: 'mauvais!!' });
    expect(bad.status).toBe(401);
    expect(bad.body.message).toBe('E-mail ou mot de passe incorrect.');

    expect((await agent.post('/api/auth/login').send(alice)).status).toBe(200);
    expect((await agent.get('/api/auth/me')).body.email).toBe(alice.email);

    expect((await agent.post('/api/auth/logout')).status).toBe(204);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });
});
