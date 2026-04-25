# 5. Dégradation gracieuse quand la WebSocket STOMP est indisponible

- **Date**: 2026-04-25
- **Status**: Accepted

## Context

RabbitDigger s'appuie sur deux protocoles pour communiquer avec RabbitMQ :

- l'API REST de management (plugin `rabbitmq_management`) pour lister les queues,
  exchanges, bindings, lire des messages de manière non destructive et publier ;
- WebStomp (plugin `rabbitmq_web_stomp`) pour la consommation temps réel via le
  composant `ConsumeView`.

Sur certains brokers le plugin `rabbitmq_web_stomp` n'est pas activé (instances
managées, déploiements minimaux, restrictions de sécurité). Même quand il l'est,
la WebSocket peut échouer pour de nombreuses raisons côté infra :

- port 15674 filtré par un pare-feu ou un security group,
- reverse proxy ne forwardant pas l'upgrade WebSocket,
- mismatch TLS (`ws://` vs `wss://`, mixed content depuis une page HTTPS),
- mauvais port renseigné dans le formulaire.

Le code historique tentait systématiquement la poignée de main WebSocket dans
`connect()`. Tout échec faisait passer la connexion entière en `error`,
empêchant l'utilisation des fonctionnalités REST pourtant parfaitement
disponibles. L'application apparaissait comme cassée.

Une première itération essayait de détecter le plugin via les `listeners` de
`/api/overview` (`protocol === 'stomp'`). Cette détection s'est avérée peu
fiable : le bridge WebSocket de `rabbitmq_web_stomp` ne s'expose pas comme un
listener `stomp` dans `/api/overview` (le listener `stomp` correspond au plugin
TCP STOMP sur 61613, séparé). Sur des brokers distants ayant le bridge actif, la
détection retournait `false` à tort ; sur d'autres elle pouvait retourner `true`
alors que la WebSocket restait inaccessible (firewall, proxy).

## Decision

1. **Le seul prérequis dur de la connexion est l'API REST.** `connect()` échoue
   uniquement si `whoami` échoue.
2. **La poignée de main STOMP est best-effort.** On la tente toujours, en
   isolant son `try/catch`. En cas de succès → `stompEnabled = true`. En cas
   d'échec :
   - on log un `console.warn` avec l'erreur d'origine (utile au diagnostic),
   - on appelle `disconnectStomp()` pour nettoyer le client à demi initialisé,
   - on laisse `stompEnabled = false`,
   - le statut global passe quand même à `connected`.
3. **`ConsumeView` se lit sur `connectionStore.stompEnabled`.** Quand il est
   faux, la vue affiche une alerte explicative et masque l'UI de souscription.
   La page reste accessible depuis la navigation pour éviter une dissymétrie
   confuse.
4. **Pas de détection préalable via `/api/overview`.** Inutile (peu fiable) et
   redondant : tenter la WebSocket fournit la réponse définitive.

## Alternatives considered

| Option | Why rejected |
|---|---|
| Détecter le plugin via `/api/overview` listeners | Le bridge `rabbitmq_web_stomp` n'expose pas de listener `protocol: 'stomp'`. Faux négatifs / faux positifs systématiques selon la conf broker. |
| Détecter via `/api/nodes` (plugins activés) | Nécessite des droits administrateur sur certaines configurations, et ne couvre pas les cas firewall / proxy / TLS où le plugin est activé mais inaccessible. |
| Masquer entièrement l'entrée *Consume* du menu et rediriger via guard de routeur | Complique le router, surprend les utilisateurs qui s'attendent à trouver la page documentée, et oblige à dupliquer la logique de feature flag. |
| Re-détecter STOMP en continu pendant la session | Hors scope ; la dégradation se ré-évalue au prochain `connect()`. |

## Consequences

**Positives**

- L'application reste utilisable dès que l'API REST fonctionne, indépendamment
  du sort de la WebSocket.
- Le pattern couvre uniformément les vraies causes possibles (plugin absent,
  firewall, proxy mal configuré, TLS), pas seulement « plugin désactivé ».
- Diagnostic facilité : l'erreur WebSocket d'origine est conservée dans la
  console (`console.warn` dans `connect()`).

**Négatives**

- La connexion attend la fin du handshake STOMP (succès ou échec) avant de
  passer à `connected`. Sur un port firewallé sans RST, cela peut prendre
  quelques secondes (timeout WebSocket du navigateur). Acceptable : c'est le
  cas dégradé d'une connexion à un broker mal exposé.
- L'erreur WebSocket est relayée uniquement via `console.warn`, pas dans l'UI.
  Si nécessaire, on pourra exposer cette information dans une vue *Diagnostic*
  ultérieure.

**Follow-up**

- L'alerte « Consume désactivé » est statique : si un opérateur active le
  plugin pendant la session, il faut se déconnecter/reconnecter. Documenté dans
  le message d'alerte.
- Tests couvrant les deux branches : `connection.test.ts` (`stompEnabled` vrai
  / faux selon le succès du handshake), `ConsumeView.test.ts` (UI active /
  dégradée).
