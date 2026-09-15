import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

describe('loadEnv', () => {
  it('refuse de démarrer sans DATABASE_URL, avec un message explicite', () => {
    expect(() => loadEnv({ APP_ORIGIN: 'http://localhost:5173' })).toThrow(/DATABASE_URL/);
  });

  it('applique les valeurs par défaut', () => {
    const env = loadEnv({ DATABASE_URL: 'postgres://x', APP_ORIGIN: 'http://localhost:5173' });
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
  });
});
