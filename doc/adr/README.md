# Architecture Decision Records

Les ADR documentent les décisions techniques significatives prises sur ce projet.

| # | Titre | Statut |
|---|---|---|
| [0001](./0001-strategie-de-tests.md) | Stratégie de tests | Accepté |
| [0002](./0002-execution-via-docker.md) | Exécution des commandes via Docker | Accepté |
| [0003](./0003-default-queue-via-definitions.md) | Queue par défaut via Definitions RabbitMQ | Accepté |
| [0004](./0004-lister-messages-queue.md) | Lister les messages d'une queue RabbitMQ | Accepté |
| [0005](./0005-degradation-gracieuse-stomp.md) | Dégradation gracieuse quand le plugin STOMP est désactivé | Accepté |
| [0006](./0006-proxy-vite-broker.md) | Proxy serveur dev pour les appels REST au broker | Accepté |
| [0007](./0007-filtre-client-side-messages-queue.md) | Filtre client-side du tableau des messages d'une queue | Accepté |
| [0008](./0008-export-csv-messages-queue.md) | Export CSV des messages d'une queue | Accepté |
| [0009](./0009-persistance-session-sans-password.md) | Persistance partielle de session sans mot de passe + expiration par inactivité | Accepté |
| [0010](./0010-creation-queue-depuis-liste.md) | Création de queue depuis la liste | Accepté |

## Format

Chaque ADR suit la trame : Contexte → Décision → Alternatives considérées → Conséquences.
