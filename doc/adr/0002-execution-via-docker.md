# 2. Exécution des commandes via Docker

- **Date** : 2026-04-24
- **Statut** : Accepté

## Contexte

Le projet déclare Yarn Berry (v4), Node 22 et plusieurs outils natifs (vue-tsc, esbuild via
Vite, vitest avec happy-dom). Sans convention claire, chaque contributeur·ice — humain ou agent —
finit par installer une version différente de Node / Yarn / Corepack sur sa machine, ce qui
provoque des résolutions de dépendances divergentes (ex. Corepack tombant sur Yarn 1.22 au lieu
de Yarn 4 quand `packageManager` n'est pas figé) et des erreurs d'install dépendantes de la
plateforme.

Par ailleurs un `docker-compose.yml` existe déjà pour faire tourner Vite + RabbitMQ ensemble.
L'image `app` embarque déjà Node 22 + Corepack + Yarn 4 ; l'utiliser aussi pour les commandes
ponctuelles (install, build, tests) supprime la divergence d'environnement sans surcoût.

## Décision

**Toutes les commandes Node du projet s'exécutent dans le container `app`**, jamais sur l'hôte.
Cela couvre `yarn install`, `yarn build`, `yarn lint`, `yarn dev`, `yarn test`,
`yarn test:run`, `yarn test:coverage`, ainsi que tout `npx` / `vue-tsc` / etc.

- Le seul prérequis sur l'hôte est **Docker + Docker Compose v2**.
- L'image est définie dans [Dockerfile.dev](../../Dockerfile.dev) ; le `CMD` est
  `yarn dev --host`, donc Vite est déjà servi dès `docker compose up -d`.
- Yarn Berry est figé via le champ `packageManager: "yarn@4.5.1"` dans
  [package.json](../../package.json) et un fichier [.yarnrc.yml](../../.yarnrc.yml) qui force
  `nodeLinker: node-modules` (compatible avec le bind mount du repo).
- Le `yarn.lock` est généré dans le container et committé.
- Forme privilégiée : un alias `drd='docker compose exec app'`, puis `drd yarn <cmd>`. Fallback
  one-shot : `docker compose run --rm app yarn <cmd>`.
- AGENTS.md et `doc/tech.MD` reflètent la règle.

## Alternatives considérées

| Option | Pourquoi écartée |
|---|---|
| Tout installer sur l'hôte (Node + Corepack + Yarn) | Reproduit la divergence d'environnement entre contributeurs ; n'évite pas le besoin du broker en local. |
| Devcontainer VS Code | Couplage à un éditeur précis ; n'aide pas les agents en CI ou en terminal. |
| Nix / asdf / mise | Demande un nouvel outil sur l'hôte pour résoudre un problème déjà résolu par Docker, déjà requis pour RabbitMQ. |
| Conserver le volume nommé `/app/node_modules` | Masquait le `node_modules` du bind mount, ce qui empêchait Yarn 4 de retrouver son state file dans le container (`Couldn't find the node_modules state file`). Supprimé au profit du seul bind mount `.:/app`. |
| Garder Yarn 1 (sans `packageManager`) | Échoue en linking sur certaines deps (`could not find a copy of vite to link`) ; impose une version implicite à tout contributeur. |

## Conséquences

**Positives**

- Environnement reproductible : la même image fournit Node, Yarn 4 et le runtime Vite.
- Plus aucune dépendance Node sur l'hôte.
- Le lockfile et l'install sont cohérents pour tout le monde.
- Simplifie l'onboarding : `docker compose up -d` suffit pour avoir Vite + RabbitMQ + un shell
  Yarn opérationnel.

**Négatives / à surveiller**

- Petite latence supplémentaire sur chaque commande (`docker compose exec` ≈ 200 ms).
- Les éditeurs qui veulent un IntelliSense TypeScript local devront soit pointer vers les
  binaires du container, soit installer Node localement à titre purement éditorial (pas pour
  exécuter le projet).
- Les permissions des fichiers générés dans le container (yarn.lock, node_modules) sortent en
  `root` côté hôte ; à régler ultérieurement (option `user:` dans le compose) si ça gêne.

## Références

- [AGENTS.md §0](../../AGENTS.md) — règle opérationnelle.
- [doc/tech.MD](../tech.MD) — section *Running in Development*.
- Yarn Berry — `packageManager` field & nodeLinker : <https://yarnpkg.com/configuration/yarnrc>.
