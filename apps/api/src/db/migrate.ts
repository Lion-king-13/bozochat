import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { join } from 'node:path';
import { loadDotenv } from '../config/dotenv';
import { createDb } from './client';

/** Applique les migrations SQL versionnées (exécuté au démarrage en production). */
async function main() {
  loadDotenv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL est obligatoire');
  const { db, pool } = createDb(url);
  // __dirname = src/db (tsx) ou dist/db (prod) → le dossier drizzle est à la racine de apps/api
  await migrate(db, { migrationsFolder: join(__dirname, '..', '..', 'drizzle') });
  await pool.end();
  console.warn('Migrations appliquées.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
