import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { join } from 'node:path';
import { createDb } from '../src/db/client';

export default async function setup() {
  const { db, pool } = createDb(process.env.DATABASE_URL ?? '');
  await migrate(db, { migrationsFolder: join(__dirname, '..', 'drizzle') });
  await pool.end();
}
