## Quoi ?

<!-- Résumé de la fonctionnalité / correction. Lier l'issue : Closes #… -->

## Pourquoi ?

<!-- Besoin utilisateur ou problème résolu -->

## Comment tester

1.
2.
3.

## Captures

<!-- Avant / après si changement visuel (mobile + desktop) -->

## Checklist

- [ ] Branche `feature/<nom>` à jour avec `main`
- [ ] `pnpm lint` et `pnpm test` passent en local
- [ ] Entrées validées (schéma Zod) et erreurs affichées clairement
- [ ] Permissions vérifiées côté serveur
- [ ] Migration générée si le schéma a changé (`pnpm --filter api db:generate`)
- [ ] Docs / UML mis à jour si nécessaire
