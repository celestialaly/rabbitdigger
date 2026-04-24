# 3. Queue par défaut via le mécanisme Definitions de RabbitMQ

- **Date**: 2026-04-25
- **Status**: Accepted

## Context

RabbitMQ démarre sans aucune queue déclarée. Les développeurs qui lancent le projet pour la première
fois doivent créer manuellement une queue avant de pouvoir tester les fonctionnalités de publication
ou de consommation. Cela alourdit l'expérience de démarrage et est source d'erreurs (mauvais nom,
mauvaise durabilité, etc.).

Il faut un moyen de garantir qu'une queue `default` (durable, vhost `/`) existe dès que le container
`rabbitmq` est opérationnel, sans intervention manuelle.

## Decision

Utiliser le mécanisme natif **Definitions** de RabbitMQ pour pré-déclarer la queue `default` au
démarrage du broker.

Deux fichiers sont ajoutés dans `docker/rabbitmq/` et montés en lecture seule dans le container :

- `rabbitmq.conf` — configure `management.load_definitions` vers `/etc/rabbitmq/definitions.json`
- `definitions.json` — déclare le vhost `/` et la queue `default` (durable, non-auto-delete)

Aucune modification du code applicatif Vue/TypeScript n'est requise.

## Alternatives considered

| Option | Why rejected |
|---|---|
| Initialisation dans le code Vue (appel `PUT /api/queues/%2F/default` au démarrage) | Couplage de l'état d'infrastructure à la logique applicative. Nécessite un droit d'écriture sur l'API Management depuis le frontend. Complexifie les tests. |
| Script shell `init` exécuté après `docker compose up` | Fragile (timing), nécessite une étape manuelle supplémentaire, non reproductible en CI sans orchestration. |
| Variable d'environnement `RABBITMQ_DEFAULT_*` | Ces variables ne supportent que l'utilisateur, le mot de passe et le vhost par défaut — pas la création de queues. |
| Image Docker personnalisée avec `rabbitmq.conf` intégré | Sur-ingénierie : le `docker-compose.yml` existant monte déjà des fichiers de config. Multiplier les images alourdit la maintenance. |

## Consequences

**Positifs**
- La queue `default` existe immédiatement après `docker compose up -d`, sans étape supplémentaire.
- Reproductible : tout développeur clonant le dépôt obtient le même état initial.
- Extensible : d'autres ressources (exchanges, bindings, utilisateurs) peuvent être ajoutées dans
  `definitions.json` sans modifier le `docker-compose.yml`.

**Négatifs / contraintes**
- RabbitMQ ne charge les définitions que sur un **volume vierge**. Si `rabbitmq_data` préexiste,
  il faut `docker compose down -v && docker compose up -d` pour réinitialiser.
- Le fichier `definitions.json` est monté en `:ro` — toute modification de la queue via l'UI
  Management est perdue au prochain `down -v`.

**Actions de suivi**
- Documenter le comportement du volume dans [doc/tech.MD](../tech.MD) ✓ (fait dans ce changeset).
