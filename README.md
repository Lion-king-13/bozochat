# 💬 BozoChat

Messagerie temps réel pour équipes (SaaS B2B) — Projet 1, _Projet d'intégration de développement_ 2026-2027.

**Production :** https://<à-compléter>
**Équipe :** NOM Prénom · NOM Prénom

| Doc                                                      | Contenu                                                      |
| -------------------------------------------------------- | ------------------------------------------------------------ |
| [01 — Hébergement](docs/01-hebergement.md)               | Comparatif Railway / Render / Fly.io et justification        |
| [02 — Cahier des charges](docs/02-cahier-des-charges.md) | Acteurs, permissions, exigences F/NF, architecture, planning |
| [03 — Modèle de données](docs/03-modele-donnees.md)      | Diagramme de classes UML, intégrité, index                   |

## Stack

| Couche          | Techno                                                       |
| --------------- | ------------------------------------------------------------ |
| Frontend        | React 19, Vite, Tailwind CSS 4, React Router, TanStack Query |
| Backend         | NestJS 11 (Node.js 22, TypeScript)                           |
| Temps réel      | Socket.IO                                                    |
| Base de données | PostgreSQL 16 + Drizzle ORM (migrations SQL versionnées)     |
| Validation      | Zod, partagé front/back (`packages/shared`)                  |
| Tests           | Vitest, Supertest, socket.io-client                          |
| CI/CD           | GitHub Actions → Coolify (VPS Hostinger)                     |

## Structure

```
apps/
  api/            NestJS : API REST (/api), gateway Socket.IO, sert le build web en prod
    src/db/       schéma Drizzle, migrations, seed
    drizzle/      migrations SQL générées (commitées)
    test/         tests e2e (auth, permissions temps réel)
  web/            React SPA : landing, pricing, auth, application
packages/
  shared/         schémas Zod + types partagés (DTO, événements WebSocket)
docs/             cahier des charges, hébergement, UML
```

## Installation locale

Prérequis : Node.js 22+ (24 LTS conseillé), pnpm (`corepack enable`), PostgreSQL local **ou** Docker.

> **Sans Docker (Windows)** : installer PostgreSQL, créer les bases `bozochat` et `bozochat_test` (`createdb -U postgres -p <port> bozochat`), puis adapter `DATABASE_URL` / `TEST_DATABASE_URL` dans `apps/api/.env` (utilisateur `postgres`, mot de passe et port choisis à l'installation). Ignorer la ligne `docker compose`.

```bash
pnpm install
docker compose up -d                      # (si Docker) PostgreSQL : bases bozochat + bozochat_test
cp apps/api/.env.example apps/api/.env
pnpm --filter @bozochat/shared build
pnpm --filter api db:migrate              # crée les tables
pnpm --filter api db:seed                 # données de démo
pnpm dev                                  # api :3000 + web :5173
```

Ouvrir http://localhost:5173 — comptes de démo : `julie@orion.test` / `demo1234` (et thomas, camille, leo, sophie, nathan).

### Commandes utiles

| Commande                        | Rôle                                                   |
| ------------------------------- | ------------------------------------------------------ |
| `pnpm dev`                      | Lance l'API et le front en mode watch                  |
| `pnpm lint` / `pnpm format`     | ESLint / Prettier                                      |
| `pnpm typecheck`                | Vérification TypeScript de tout le monorepo            |
| `pnpm test`                     | Tests unitaires + e2e (utilise `TEST_DATABASE_URL`)    |
| `pnpm build`                    | Build de production                                    |
| `pnpm --filter api db:generate` | Génère une migration après modification de `schema.ts` |
| `pnpm --filter api db:studio`   | Explorateur de base de données                         |

## Git — GitHub Flow

1. `git switch -c feature/<nom>` depuis `main` à jour
2. Commits, push, **Pull Request** (le template liste les étapes de test)
3. La CI doit être verte + **review d'un pair** obligatoire
4. Merge → **déploiement automatique en production**

À configurer sur GitHub : _Settings → Branches → Branch protection rule_ sur `main` : « Require a pull request » (1 approbation) + « Require status checks » (`Lint, typecheck, tests, build`).

## Déploiement (Hostinger VPS + Coolify)

Choix et justification : [docs/01-hebergement.md](docs/01-hebergement.md). L'application est construite à partir du [`Dockerfile`](Dockerfile) (build multi-stage, migrations au démarrage, healthcheck `/api/health`).

### 1. Serveur

1. Hostinger → VPS avec le **template Coolify** (Ubuntu). 4 Go de RAM minimum conseillés (le build tourne sur le serveur).
2. Ouvrir Coolify (`http://<IP-du-VPS>:8000`), créer le compte admin **immédiatement** (le premier inscrit devient admin).
3. Sécurité : connexion SSH par clé, pare-feu limité aux ports 22, 80, 443 (et 8000 le temps de configurer un domaine pour Coolify).

### 2. Base de données

Coolify → **Projects → + New → Database → PostgreSQL**. Démarrer, puis copier l'**URL de connexion interne** (réseau Docker, non exposée publiquement). Activer les **sauvegardes planifiées**.

### 3. Application

1. **+ New → Private Repository (with GitHub App)** → sélectionner le repo, branche `main`.
2. **Build Pack : Dockerfile**. Port exposé : `3000`.
3. **Désactiver « Auto Deploy »** : c'est la CI qui déclenche le déploiement quand elle est verte.
4. **Domaine** : `https://bozochat.<votre-domaine>` (sous-domaine pointant vers l'IP du VPS, enregistrement DNS A) ou le domaine `sslip.io` fourni par Coolify. HTTPS automatique.
5. **Environment Variables** :
   - `DATABASE_URL` = URL interne PostgreSQL copiée à l'étape 2
   - `APP_ORIGIN` = `https://bozochat.<votre-domaine>` (exactement le domaine public, sans `/` final)
   - `NODE_ENV` = `production`
6. **Deploy** une première fois à la main, vérifier les logs puis `https://…/api/health`.
7. Données de démo (optionnel) : onglet **Terminal** du conteneur → `node dist/db/seed.js`.

### 4. Déploiement automatique depuis GitHub Actions

1. Coolify → **Keys & Tokens → API tokens** : créer un token (permission _deploy_).
2. Application → **Webhooks** : copier l'URL « Deploy Webhook ».
3. GitHub → **Settings → Secrets and variables → Actions** :
   - Secrets : `COOLIFY_WEBHOOK` (URL du webhook), `COOLIFY_TOKEN` (token API)
   - Variable : `PRODUCTION_URL` = `https://bozochat.<votre-domaine>`

À chaque merge sur `main` : CI verte → job **deploy** → Coolify construit l'image, vérifie le healthcheck et bascule. Les logs de build sont dans Coolify, le statut dans l'onglet **Actions** de GitHub.

**Aucun secret dans le repo** : `.env` est ignoré par Git et Docker, les valeurs réelles vivent dans Coolify et les secrets GitHub.

## Architecture

Un seul service Node sert le front, l'API et les WebSockets sur **la même origine** → cookie de session `httpOnly`, CORS strict, un seul déploiement. Détails et schéma : [cahier des charges §7](docs/02-cahier-des-charges.md#7-architecture-vue-densemble).

Sécurité en place : mots de passe argon2, sessions en base (token haché), `helmet`, rate limiting (auth), validation Zod de toutes les entrées, filtre d'exceptions global (aucune stack trace côté client), vérification d'appartenance avant tout abonnement à une conversation.
