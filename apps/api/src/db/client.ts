import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;

export function createDb(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl, max: 10 });
  return { db: drizzle(pool, { schema }), pool };
}
