# 4. Lister les messages d'une queue RabbitMQ

- **Date**: 2026-04-25
- **Status**: Accepted

## Context

RabbitDigger permet aujourd'hui de **publier** des messages (REST) et de **consommer** des messages
en temps réel via STOMP, mais il n'existe aucun moyen d'**inspecter** les messages déjà présents
dans une queue sans les consommer définitivement. Pour les sessions de debug ("Qu'est-ce qui est
coincé dans `default` ?", "Le routing key est-il correct ?", "Y a-t-il des messages binaires
inattendus ?"), c'est un manque majeur.

L'API Management de RabbitMQ expose `POST /api/queues/{vhost}/{name}/get` pour lire un lot de
messages. Cette API présente plusieurs contraintes structurantes :

- **Aucun vrai "peek"** : tout message lu doit être ré-injecté (`ackmode: ack_requeue_true`) ou
  retiré (`ack_requeue_false`). Le requeue change l'ordre et passe `redelivered=true`.
- **Pas de pagination côté serveur** : le paramètre `count` borne le lot, mais il n'y a ni
  `offset` ni curseur.
- **Pas de filtre côté serveur** : aucun filtrage par routing key, header ou body.
- **Pas de support pour les queues `stream`** : l'endpoint `/get` est réservé aux queues classiques
  et quorum.
- **Encodage payload** : `encoding: auto` renvoie soit `string` (UTF-8 valide) soit `base64`
  (binaire ou non-UTF-8).

L'objectif est d'offrir une UX utile dès la première itération, en assumant ces contraintes plutôt
qu'en les masquant.

## Decision

Ajouter une vue de détail de queue accessible via `/queues/:name`, contenant un onglet **Messages**
qui appelle `POST /api/queues/{vhost}/{name}/get`. La fonctionnalité est livrée en **trois phases**
indépendantes mais cumulatives.

### Phase 1 — Lister et afficher

- Nouvelle route `/queues/:name` (`name: 'queue-detail'`) avec `v-tabs` (Détails / Messages).
- L'onglet **Détails** affiche les colonnes existantes pour la queue sélectionnée
  (lookup dans `useQueuesStore`, refresh si nécessaire).
- L'onglet **Messages** héberge un nouveau composant `QueueMessageList` :
  - Champ `count` (nombre de messages à récupérer, défaut 50).
  - Toggle `Requeue messages` (par défaut **on** = `ack_requeue_true`, sinon `ack_requeue_false`).
  - Bouton **Fetch** (action explicite uniquement, pas d'auto-refresh).
  - `v-data-table` : `#`, routing key, exchange, redelivered, payload bytes, preview (80 car).
  - Expand row : payload complet décodé + properties + headers JSON formaté.
  - Badge `binary` quand le payload retourné est en `base64` et n'est pas décodable en UTF-8.
- **Truncate** côté serveur fixé à 50 000 octets ; bandeau "tronqué" si `payload_bytes > truncate`.
- **Queues `stream`** : l'onglet Messages affiche un message d'information explicite et désactive
  le formulaire (l'API `/get` ne supporte pas ce type).
- Service : `management.getQueueMessages(name, { count, requeue, vhost })`.
- Store : `useQueueMessagesStore` (setup style, mêmes conventions `loading`/`error` que
  `useQueuesStore`).
- Utilitaire : `decodePayload(payload, encoding)` retournant `{ text, binary }`.
- Lien depuis `QueuesView` : la colonne `name` devient un `RouterLink` vers la vue détail.

### Phase 2 — Pagination client-side

- Pagination native `v-data-table` (10/25/50/100 par page) sur le batch chargé.
- Le sélecteur `count` (taille du fetch broker) reste séparé et explicite.
- Affichage `messages.length / message_count` (compteur total broker) pour signaler la couverture.

### Phase 3 — Filtres client-side

- Filtres : full-text body (debounce 300 ms), routing key (substring + toggle regex), header
  key=value, taille payload min/max bytes.
- Logique extraite dans un composable `useMessageFilters`.
- **Filtres exclusivement client-side**, sur le batch chargé. Pas de refetch automatique
  (cf. *Alternatives considered*).
- Bouton "Reset filtres" + gestion d'erreur regex invalide inline (pas de crash).

## Alternatives considered

| Option | Why rejected |
|---|---|
| Lecture destructive par défaut (`ack_requeue_false`) | Casse silencieusement la file en debug. Le toggle UI laisse le choix explicite à l'utilisateur, défaut sûr. |
| Vrai "peek" via une queue miroir / un consumer STOMP éphémère | Complexe (création/cleanup d'une queue temporaire), nécessite des droits étendus, et contourne `/get` qui reste plus simple à exploiter. |
| Pagination via fetchs successifs `/get count=N` | Chaque appel requeue tout le lot précédent : ordre perdu, tous les messages marqués `redelivered`, charge inutile sur le broker. La pagination client-side sur un fetch unique paramétrable est plus prévisible. |
| Filtres serveur via consumer STOMP avec sélecteur | STOMP ne supporte pas de sélecteur côté broker dans RabbitMQ. Filtrage côté client suffit pour des batches de quelques centaines de messages. |
| Refetch automatique debounced lors de la saisie d'un filtre | Coût broker élevé (chaque keystroke = un /get qui requeue tout le batch, perd l'ordre, marque `redelivered`). Filtrer le batch en mémoire est suffisant et instantané. |
| Vue "drawer" / dialog plutôt qu'une route | Une route dédiée permet le partage d'URL, le bouton retour navigateur, et l'extension future (autres onglets : bindings, consommateurs, stats). |
| Réutiliser `useMessagesStore` (ring-buffer 200 STOMP) | Sémantique différente (push temps-réel vs pull ponctuel), risque de mélanger ack/nack STOMP avec messages requeueés via REST. Store séparé clarifie. |

## Consequences

**Positifs**
- Inspection non destructive d'une queue dès la Phase 1.
- URL partageable (`/queues/:name`) pour collaborer en debug.
- Gestion explicite des payloads binaires (badge + base64 brut).
- Découpage en phases : valeur dès la P1, complexité ajoutée seulement si justifiée.

**Négatifs / contraintes**
- Le requeue altère l'ordre et marque `redelivered` : documenté dans l'UI via la position
  "actuelle" du message et le flag affiché.
- Pas de pagination ni filtre côté serveur : les batches > quelques milliers de messages ne
  sont pas viables. Limite implicite acceptée pour un outil de **debug**, pas de production data.
- Les queues `stream` ne sont pas supportées sur cet onglet (limitation API).
- Le store `useQueueMessagesStore` est local à une queue (overwrite à chaque fetch) — pas de
  cache multi-queues en P1.

**Actions de suivi**
- Mettre à jour [doc/tech.MD](../tech.MD) : nouvelle route, nouveau service endpoint, nouveau
  store, nouvel utilitaire (fait dans ce changeset).
- Phase 2 et Phase 3 livrées dans des changesets séparés.
- Si besoin futur d'inspecter des queues volumineuses : envisager un consumer STOMP éphémère
  avec ack=false (nécessitera un nouvel ADR).
