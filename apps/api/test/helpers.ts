import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { sql } from 'drizzle-orm';
import { AppModule } from '../src/app.module';
import type { Database } from '../src/db/client';
import { DB } from '../src/db/db.module';
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
