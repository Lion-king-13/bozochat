import { createHash, randomBytes } from 'node:crypto';

export const SESSION_COOKIE = 'bozochat_sid';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Seul le hash est stocké en base : une fuite de la table ne permet pas de voler des sessions. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
