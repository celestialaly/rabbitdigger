# 6. Proxy serveur dev pour les appels REST au broker

- **Date** : 2026-04-25
- **Statut** : Accepté

## Contexte

La connexion RabbitDigger est paramétrée par l'utilisateur·ice via le formulaire
*Connect* (`host`, `managementPort`, `stompPort`, etc.).

Initialement, `src/services/management.ts` construisait toutes ses URLs avec un
préfixe fixe `/api`, et `vite.config.ts` proxifiait `/api/*` en dur vers
`http://rabbitmq:15672` (le broker Docker local). Conséquence : les champs
`host` / `managementPort` étaient **ignorés pour REST**, le navigateur tapait
toujours sur le broker local, `whoami()` réussissait avec `guest/guest`, et
l'application affichait les queues / messages du *mauvais* broker. Le
handshake STOMP, lui, partait bien sur l'hôte saisi mais son échec est
non bloquant ([ADR 0005](./0005-degradation-gracieuse-stomp.md)), ce qui
masquait totalement le bug.

Première tentative de correctif : appeler **directement** le broker
(`http://${host}:${managementPort}/api/...`) et activer CORS sur le broker
local (`management.cors.allowed_origins`). Ça marchait pour le broker Docker
fourni, mais cassait dès qu'un broker distant ne pouvait pas être
reconfiguré :

> *Blocage d'une requête multiorigine : la politique « Same Origin » ne permet
> pas de consulter la ressource distante située sur
> http://192.168.1.40:15672/api/whoami.*

L'API Management de RabbitMQ n'envoie un header `Access-Control-Allow-Origin`
que si `management.cors.allowed_origins` est explicitement configuré. Sur la
majorité des brokers managés, internes ou de prod, on ne peut pas le faire.

## Décision

Tous les appels REST passent par un **middleware Vite same-origin** monté sur
`/__rabbit`, qui forwarde la requête vers le broker indiqué par le client dans
un header `X-Rabbit-Target` (ex. `http://192.168.1.40:15672`).

- Côté navigateur, plus aucun appel cross-origin → CORS hors-jeu, quelle que
  soit la conf du broker cible.
- Côté serveur Vite, le middleware fait un `fetch` Node vers le broker. Il
  recopie méthode, body, headers (sauf hop-by-hop / `host` / `x-rabbit-target`)
  et renvoie la réponse telle quelle (status, headers, body), en prenant soin
  de retirer les headers CORS upstream qui n'ont aucun sens ici.
- Le `host` / `managementPort` du store alimentent le header `X-Rabbit-Target`
  via `getHeaders()` dans `src/services/management.ts`. Le formulaire
  *Connect* est donc honoré.
- Le STOMP continue à se connecter directement (`ws://${host}:${stompPort}/ws`)
  — pas d'enjeu CORS sur les WebSockets.
- Aucune conf CORS sur le broker n'est requise. La conf
  `management.cors.allowed_origins` ajoutée temporairement à
  `docker/rabbitmq/rabbitmq.conf` est retirée.

## Alternatives considérées

| Option | Pourquoi écartée |
|---|---|
| Appel REST direct + CORS sur le broker | Marche pour le broker Docker local, mais impossible à imposer sur la plupart des brokers distants ; reproduit l'erreur observée par l'utilisateur. |
| Proxy Vite statique vers une cible fixe (`vite.config.ts > server.proxy`) | Ne supporte qu'une seule cible définie au démarrage ; incompatible avec un host saisi dynamiquement par l'utilisateur. |
| Proxy reconfigurable via redémarrage de Vite à chaque connexion | Inacceptable côté UX et inenvisageable en pratique (Vite ne supporte pas le reload de proxy à chaud). |
| Encoder la cible dans le path (`/__rabbit/http%3A%2F%2F.../api/...`) | URL imprononçables, encodage bruyant dans les logs, conflits avec les chemins Management qui contiennent eux-mêmes du `%2F` (vhost). Le header est plus lisible et non ambigu. |
| Backend applicatif dédié (Node/Express) | Ajoute un service à maintenir alors qu'un middleware Vite suffit en dev ; hors scope (le projet est dev-only, ADR 0002). |
| Documenter « configurez CORS sur votre broker » | Régression UX : la moitié de l'intérêt de RabbitDigger est de viser un broker arbitraire sans le toucher. |

## Conséquences

**Positives**

- Le formulaire *Connect* est enfin réellement honoré pour REST comme STOMP.
- Aucune contrainte CORS sur les brokers cibles.
- Le mécanisme est complètement transparent côté code applicatif : seul
  `getHeaders()` connaît le proxy.
- Le broker Docker local n'a plus besoin de conf CORS (rollback effectué).

**Négatives / à surveiller**

- **Le proxy n'existe qu'en dev.** Une éventuelle build statique servie sans
  Vite n'aurait plus accès à `/__rabbit`. C'est cohérent avec ADR 0002
  (l'environnement d'exécution est le container `app` qui sert Vite). Si on
  ajoute un mode prod un jour, il faudra remplacer le middleware par un
  équivalent (reverse-proxy nginx, petit serveur Node, etc.).
- **`localhost` dans le formulaire ≠ localhost côté serveur.** Le middleware
  tourne dans le container `app`, où `localhost` désigne le container
  lui-même. Le proxy réécrit donc `localhost` / `127.0.0.1` → `rabbitmq`
  (le nom DNS du service Docker du compose) côté serveur. Côté navigateur le
  champ reste `localhost` pour que la WebSocket STOMP joigne bien la machine
  hôte. Un broker local hors Docker peut être adressé via son IP LAN
  (ex. `192.168.x.x`) ou en personnalisant `RABBITDIGGER_LOCAL_BROKER_HOST`.
- Les credentials Basic transitent par le serveur Vite. C'était déjà le cas
  dans la version initiale `/api`. Toujours utiliser HTTPS si Vite est exposé
  hors `localhost`.
- Le proxy fait confiance à `X-Rabbit-Target` : n'importe quel script servi
  par Vite peut atteindre n'importe quelle URL côté réseau interne du serveur
  Vite. Acceptable en dev local ; à durcir (allow-list, env var) si l'on
  ouvre Vite à un réseau partagé.

## Références

- [ADR 0002](./0002-execution-via-docker.md) — environnement dev-only via Docker.
- [ADR 0005](./0005-degradation-gracieuse-stomp.md) — pourquoi un STOMP cassé
  ne remontait pas à l'utilisateur, masquant ce bug.
- [doc/tech.MD](../tech.MD) § *Architecture*.
- RabbitMQ Management CORS : <https://www.rabbitmq.com/management.html#cors>
  (rappel : non requis grâce au proxy).
