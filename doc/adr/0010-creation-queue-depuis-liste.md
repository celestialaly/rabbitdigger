# 10. Création de queue depuis la liste

- **Date** : 2026-04-27
- **Statut** : Accepté

## Contexte

Jusqu'ici, RabbitDigger ne permettait que la **lecture** des queues (liste, détail,
inspection des messages). Toute création devait passer par la Management UI native ou par
un client AMQP, ce qui casse le flux quand on explore un broker depuis l'application.

L'API HTTP `PUT /api/queues/{vhost}/{name}` du plugin `rabbitmq_management` accepte de
nombreux paramètres : `durable`, `auto_delete`, `arguments` (`x-queue-type`,
`x-message-ttl`, `x-max-length`, `x-dead-letter-exchange`, `x-max-priority`, `x-overflow`,
`x-single-active-consumer`, etc.), `node`. Le risque : exposer trop de champs d'un coup
gonfle la modale et bloque la livraison sans bénéfice immédiat pour le 80 % des cas
(développement local et exploration).

## Décision

On ajoute un bouton **« New queue »** dans la toolbar de `QueuesView` qui ouvre une modale
`CreateQueueDialog` avec un formulaire **minimal** :

- `name` (requis, max 255 octets, refus du préfixe réservé `amq.`),
- `type` (`classic` | `quorum` | `stream`, envoyé via `arguments['x-queue-type']`),
- `durable` (case à cocher, défaut `true`),
- `auto_delete` (case à cocher, défaut `false`).

Contraintes de typage encodées en UI :

- Pour `quorum` et `stream`, `durable` est forcé à `true` et `auto_delete` à `false`
  (broker constraint), et les deux cases sont **désactivées** pour éviter toute
  incohérence entre ce que l'utilisateur voit et ce qui est envoyé.

Le **vhost** utilisé est celui de la session (lu depuis `useConnectionStore`) — pas de
sélecteur dans cette première itération.

Découpage technique :

- `management.createQueue(input)` dans [src/services/management.ts](../../src/services/management.ts)
  utilise un nouveau helper `requestNoContent` (RabbitMQ renvoie 201/204 sans corps) et
  émet `PUT /api/queues/{vhost}/{name}` avec un body
  `{ durable, auto_delete, arguments: { 'x-queue-type': type } }`.
- L'action `createQueue` du store [src/stores/queues.ts](../../src/stores/queues.ts)
  délègue au service, puis appelle `refreshQueues()` ; les erreurs sont propagées pour
  affichage inline.
- La modale [src/components/CreateQueueDialog.vue](../../src/components/CreateQueueDialog.vue)
  suit le pattern de [src/components/ExportCsvDialog.vue](../../src/components/ExportCsvDialog.vue)
  (props `modelValue`, emits `update:modelValue` / `created`, validation inline via
  `computed`, feedback d'erreur via `<v-alert>`).

## Alternatives considérées

| Option | Pourquoi rejetée |
|---|---|
| Formulaire complet exposant tous les arguments `x-*` (TTL, max-length, DLX, priority, overflow, etc.) | Trop large pour une première livraison ; ajoute beaucoup de surface de validation et de tests pour des besoins rares. À ré-ouvrir en ADR ultérieur si la demande émerge. |
| Champ libre `arguments` JSON brut | Mauvais UX (saisie d'objet JSON dans un textarea), favorise les erreurs silencieuses, peu d'aide au débutant. |
| Sélecteur de vhost dans la modale | La session a déjà un vhost ; multi-vhost n'est pas supporté ailleurs dans l'app. À traiter de façon globale (changement de vhost depuis le header) si le besoin émerge. |
| Snackbar global de succès | Pas de système de notifications dans le projet ; la fermeture de la modale + le rafraîchissement de la liste donnent un feedback suffisant. À introduire transversalement dans un ADR dédié. |
| Limiter aux queues `classic` uniquement | Les queues `quorum` sont le défaut moderne recommandé ; les exclure forcerait l'utilisateur à sortir de l'app. |

## Conséquences

**Positives**
- Boucle complète création → liste → inspection sans quitter RabbitDigger.
- Cohérence avec le pattern modale existant (`ExportCsvDialog`) : pas de nouveau
  paradigme à apprendre côté UI ou côté tests.
- Helper `requestNoContent` réutilisable pour les futures opérations write
  (ex. `DELETE /api/queues/...`, futurs binding/exchange creates).

**Négatives / limites**
- Pas de gestion de policies, de TTL, de DLX ni d'`arguments` avancés : un utilisateur
  qui en a besoin doit toujours passer par la Management UI. Documenté ici pour ouvrir
  proprement un futur ADR.
- Les contraintes propres à `quorum` / `stream` sont encodées en dur côté front. Si
  RabbitMQ assouplit ces contraintes, il faudra mettre à jour la modale.

**Suivi**
- Tests : `management.createQueue` (boundary HTTP), action store, composant modale
  (validation, contraintes par type, succès, échec), test d'intégration du bouton dans
  `QueuesView`.
- Documentation : entrée ajoutée dans la liste de features ([README.md](../../README.md))
  et dans la structure du projet ([doc/tech.MD](../tech.MD)).
