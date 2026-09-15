# 01 — Choix de l'hébergement

> Rappel de la consigne : _l'hébergement guide la stack, pas l'inverse._
> Les tarifs évoluent souvent : **vérifier les pages officielles** et mettre à jour ce document (date de vérification en bas).

## 1. Besoins qui conditionnent l'hébergement

| Besoin                               | Conséquence technique                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Temps réel (messages, notifications) | Connexions **WebSocket longues** → **processus serveur persistant** (pas de serverless type Vercel Functions) |
| Persistance des données              | **PostgreSQL** qui survit aux redéploiements (volume persistant), avec sauvegardes                            |
| `main` = production                  | Déploiement **automatique depuis GitHub**, statut de build et logs consultables                               |
| Démo live en classe                  | **Pas de mise en veille** (cold start = démo ratée)                                                           |
| Secrets hors repo                    | Gestion des **variables d'environnement** dans l'interface                                                    |
| Budget étudiant                      | Quelques € / mois maximum                                                                                     |

## 2. Grille comparative

| Critère                 | **Hostinger VPS + Coolify**                                    | Railway                           | Render                             |
| ----------------------- | -------------------------------------------------------------- | --------------------------------- | ---------------------------------- |
| Type                    | VPS (IaaS) + PaaS open source auto-hébergé                     | PaaS managé                       | PaaS managé                        |
| WebSockets              | ✅ (reverse proxy Traefik intégré)                             | ✅                                | ✅                                 |
| PostgreSQL              | ✅ en 1 clic dans Coolify (conteneur + volume, sauvegardes S3) | ✅ managé                         | ✅ (free DB limitée dans le temps) |
| Mise en veille          | ✅ jamais (serveur dédié)                                      | ✅ pas de veille (plan payant)    | ❌ free tier s'endort              |
| Déploiement auto GitHub | ✅ GitHub App ou webhook de déploiement                        | ✅                                | ✅                                 |
| HTTPS                   | ✅ Let's Encrypt automatique                                   | ✅                                | ✅                                 |
| Logs / statut de build  | ✅ interface Coolify                                           | ✅                                | ✅                                 |
| Config as code          | `Dockerfile` (standard, portable)                              | `railway.json`                    | `render.yaml`                      |
| Coût                    | Prix fixe du VPS (template Coolify proposé par Hostinger)      | Crédit d'essai puis usage (~5 $+) | Free avec veille / payant dès ~7 $ |
| Maintenance             | ⚠️ à notre charge (mises à jour OS, sécurité SSH, ressources)  | Aucune                            | Aucune                             |
| Apprentissage           | ⭐⭐⭐ Docker, reverse proxy, DNS, serveur Linux               | ⭐                                | ⭐                                 |

## 3. Décision : **VPS Hostinger + Coolify**

Coolify est une alternative open source à Heroku / Vercel / Railway, installée sur notre propre VPS. Hostinger propose un template VPS avec Coolify préinstallé.

```
VPS Hostinger (Ubuntu + Docker)
└── Coolify
    ├── Traefik (reverse proxy, HTTPS Let's Encrypt, WebSockets)
    ├── Application "bozochat"   ← conteneur construit depuis le Dockerfile du repo
    │     NestJS : API REST + Socket.IO + fichiers statiques du build React
    └── Base "postgres"          ← PostgreSQL 16 + volume persistant + sauvegardes planifiées
```

### Pourquoi ce choix

- **Prix fixe et prévisible** : pas de facturation à l'usage, pas de surprise si une boucle de reconnexion WebSocket s'emballe.
- **Aucune mise en veille**, performances dédiées : idéal pour les démos en production.
- **Standard et portable** : l'application est une image Docker classique → déployable ailleurs sans modification (pas de dépendance à un fournisseur).
- **Compétences DevOps réelles** : Docker multi-stage, reverse proxy, DNS, HTTPS, variables d'environnement, healthchecks — valorisables pour le TFE.
- **Plusieurs projets sur le même serveur** : le VPS pourra héberger les projets suivants de l'année.

### Pourquoi un seul conteneur applicatif

- **Même origine** pour le front, l'API et les WebSockets → cookie de session `httpOnly` sans CORS cross-site.
- **Un seul pipeline** et un seul déploiement : front et back toujours à la même version.

### Limites assumées (à discuter dans le rapport)

- **Maintenance à notre charge** : mises à jour du système et de Coolify, sécurisation SSH (clé, pas de mot de passe root), pare-feu. → Tâche assignée au référent déploiement.
- **Point unique de défaillance** : si le VPS tombe, tout tombe. Acceptable pour le projet ; parade : sauvegardes PostgreSQL automatiques vers un stockage externe.
- **Scalabilité horizontale** : plusieurs instances nécessiteraient un adapter Redis pour Socket.IO (ajout d'un service Redis dans Coolify).
- **Ressources partagées** : le build Docker consomme CPU/RAM sur le même serveur que la prod → choisir un VPS avec assez de RAM (4 Go minimum conseillé).

### Alternatives écartées

- **Vercel / Netlify seuls** : serverless → pas de WebSockets persistants.
- **Render free** : veille après inactivité → risque en démo.
- **Railway** : très simple, mais coût à l'usage et moins d'apprentissage infrastructure.
- **Supabase / Firebase comme backend** : réduiraient le travail backend demandé par le cours.

## 4. Pipeline CI/CD retenu

```
PR ouverte ──► GitHub Actions : format · lint · typecheck · tests (PostgreSQL) · build · build Docker
merge main ─► mêmes vérifications ──(si vert)──► webhook Coolify ──► build de l'image ──► healthcheck ──► bascule
```

Le déploiement est déclenché **par GitHub Actions uniquement si la CI est verte** (et non par un simple push), pour garantir que `main` = production fonctionnelle.

---

_Dernière vérification des tarifs : à compléter (JJ/MM/2026)._
