import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import type { Database } from '../src/db/client';
import { DB } from '../src/db/db.module';
import { conversations, participants, workspaceMembers, workspaces } from '../src/db/schema';
import { setupApp } from '../src/setup-app';

export const TEST_ORIGIN = 'http://localhost:5173';

export async function createTestApp() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  setupApp(app, TEST_ORIGIN);
  await app.init();
  return { app, db: app.get<Database>(DB) };
}

export async function resetDb(db: Database) {
  await db.execute(
    sql`TRUNCATE messages, participants, conversations, workspace_members, workspaces, sessions, users CASCADE`,
  );
}

export type TestUser = { id: string; cookie: string };

/** Crée un compte via l'API et renvoie son cookie de session. */
export async function signup(app: NestExpressApplication, name: string): Promise<TestUser> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/register')
    .send({ email: `${name}@test.be`, displayName: name, password: 'motdepasse' });
  const cookie = String(res.headers['set-cookie']?.[0]).split(';')[0]!;
  return { id: (res.body as { id: string }).id, cookie };
}

/**
 * Workspace + conversation de groupe insérés directement en base : la création de
 * conversations n'est pas encore exposée par l'API.
 * `outsiders` sont membres du workspace mais **pas** participants.
 */
export async function createConversation(
  db: Database,
  members: TestUser[],
  outsiders: TestUser[] = [],
) {
  const [workspace] = await db
    .insert(workspaces)
    .values({ name: 'Test', slug: `test-${randomUUID()}` })
    .returning();
  await db
    .insert(workspaceMembers)
    .values([...members, ...outsiders].map((u) => ({ workspaceId: workspace!.id, userId: u.id })));
  const [conversation] = await db
    .insert(conversations)
    .values({ workspaceId: workspace!.id, type: 'GROUP', name: 'Équipe' })
    .returning();
  await db
    .insert(participants)
    .values(members.map((u) => ({ conversationId: conversation!.id, userId: u.id })));
  return conversation!;
}
