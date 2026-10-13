import type { WorkspaceRole } from '@bozochat/shared';

/**
 * Hiérarchie des rôles d'un workspace. Règle unique pour toute gestion de membre :
 * on n'agit que sur quelqu'un de **strictement** inférieur, et on n'attribue jamais
 * un rôle supérieur au sien. L'owner n'est donc jamais modifiable ni retirable.
 */
const RANK: Record<WorkspaceRole, number> = { MEMBER: 1, ADMIN: 2, OWNER: 3 };

export function hasRole(role: WorkspaceRole, minimum: WorkspaceRole): boolean {
  return RANK[role] >= RANK[minimum];
}

export function outranks(actor: WorkspaceRole, target: WorkspaceRole): boolean {
  return RANK[actor] > RANK[target];
}

/** Slug lisible et unique : « Agence Orion » → `agence-orion-3f2a9c`. */
export function slugify(name: string, suffix: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base ? `${base}-${suffix}` : suffix;
}
