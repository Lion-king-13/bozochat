import { z } from 'zod';

/** Variables d'environnement validées au démarrage : l'app refuse de démarrer si une manque. */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL est obligatoire'),
  APP_ORIGIN: z.url('APP_ORIGIN doit être une URL (ex. https://bozochat.up.railway.app)'),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Configuration invalide :\n${details.join('\n')}`);
  }
  return parsed.data;
}
