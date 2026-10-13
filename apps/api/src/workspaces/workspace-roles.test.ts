import { describe, expect, it } from 'vitest';
import { hasRole, outranks, slugify } from './workspace-roles';

describe('rôles de workspace', () => {
  it('ordonne OWNER > ADMIN > MEMBER', () => {
    expect(hasRole('OWNER', 'ADMIN')).toBe(true);
    expect(hasRole('ADMIN', 'ADMIN')).toBe(true);
    expect(hasRole('MEMBER', 'ADMIN')).toBe(false);
  });

  it("n'autorise à agir que sur un rôle strictement inférieur", () => {
    expect(outranks('OWNER', 'ADMIN')).toBe(true);
    expect(outranks('ADMIN', 'MEMBER')).toBe(true);
    expect(outranks('ADMIN', 'ADMIN')).toBe(false);
    expect(outranks('ADMIN', 'OWNER')).toBe(false);
    expect(outranks('OWNER', 'OWNER')).toBe(false);
  });
});

describe('slugify', () => {
  it('retire accents et caractères spéciaux', () => {
    expect(slugify('  Équipe Été & Co ! ', 'abc123')).toBe('equipe-ete-co-abc123');
  });

  it('reste valide pour un nom sans caractère latin', () => {
    expect(slugify('🚀🚀', 'abc123')).toBe('abc123');
  });
});
