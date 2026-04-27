# 11. Import CSV de messages dans une queue

- **Date**: 2026-04-27
- **Status**: Accepted

## Context

L'export CSV (ADR 0008) permet d'extraire un batch de messages d'une queue dans un format
tabulaire RFC 4180. Le besoin symétrique remonte : **ré-injecter** ce CSV dans une queue
pour rejouer un scénario de bug, alimenter une queue de test depuis un dump produit
ailleurs, ou comparer le comportement avant/après un changement applicatif sur le même set
de messages.

L'API Management de RabbitMQ expose un endpoint
`POST /api/exchanges/{vhost}/{name}/publish` capable de publier un message arbitraire avec
ses propriétés. Tout est donc côté client : parser le CSV, valider, et boucler sur l'API.

Reste à fixer un format d'entrée prévisible, à choisir le périmètre des champs à
préserver, et à intégrer l'UX au bon endroit dans l'application.

## Decision

Livrer un import **CSV client-side** déclenché depuis un **nouvel onglet `Import`** dans
[QueueDetailView](../../src/views/QueueDetailView.vue), à côté de `Details` et `Messages`.

### UX

- L'onglet rend [ImportCsvPanel](../../src/components/ImportCsvPanel.vue), un panneau
  inline (pas de modale) en trois sections empilées :
  1. **Pick** : `v-file-input` + champs `Separator` / `Delimiter` (defaults `,` et `"`,
     mêmes règles de validation que `ExportCsvDialog` — exactement 1 caractère,
     `separator ≠ delimiter`).
  2. **Preview** (visible dès qu'un parse réussit) : alerte info `N message(s) to import
     to queue <name>` (avec mention `header row detected` quand applicable), récap des
     erreurs de validation (10 max + "and X more"), table des 5 premières lignes
     (`id`, `encoding` détecté, `body` tronqué à 80 caractères).
  3. **Publishing** : barre `v-progress-linear` `X / N`, bouton **Cancel** visible
     pendant l'envoi. Récap final (`Published N, M failed, K canceled`) en sortie.
- L'état du panneau est **reset** à chaque entrée dans l'onglet via un `watch(tab)` côté
  parent qui appelle la méthode `reset()` exposée par `ImportCsvPanel` (`defineExpose`).

### Format CSV accepté

Identique à l'export ADR 0008 (mêmes 6 colonnes dans le même ordre) :
`id, size, body, routing key, source queue, source exchange`.

- **Header optionnel** : auto-détecté ssi la 1re ligne correspond exactement à
  `EXPECTED_COLUMNS` (case-sensitive après trim). Sinon ordre fixe supposé.
- **Validation tout-ou-rien** avant publish : aucun appel n'est émis tant qu'au moins une
  ligne est invalide. Règles :
  - chaque ligne doit avoir exactement 6 colonnes ;
  - `body` peut être vide (un message AMQP vide est valide) ;
  - `size` est ignoré (recalculé broker) ;
  - le parser RFC 4180 doit accepter le fichier (quotes terminées, etc.).

### Mapping vers l'API

Pour chaque ligne :

| CSV → publish | Valeur |
|---|---|
| `exchange` | `''` (default exchange) |
| `routing_key` | nom de la queue cible (la `routing key` du CSV est ignorée) |
| `payload` | `body` du CSV |
| `payload_encoding` | **auto-détecté** : `base64` si `body` matche `/^[A-Za-z0-9+/]+={0,2}$/` (longueur multiple de 4) **et** `atob` réussit, sinon `string` |
| `properties.message_id` | `id` du CSV si non vide, sinon absent |
| autres propriétés | défauts du service (`delivery_mode: 2`, `headers: {}`) |

`management.publishMessage` est étendu avec une signature à options pour accepter ces
nouveaux paramètres (`payloadEncoding`, `properties`, `headers`, `vhost`) ; le call-site
existant dans [PublishView](../../src/views/PublishView.vue) est adapté.

### Stratégie de publication

- Concurrence **bornée à 10** : workers parallèles tirant les lignes via un curseur partagé.
- Une erreur sur une ligne est comptabilisée (`failed`) mais **n'interrompt pas** le batch
  (la pré-validation a déjà rejeté tout problème de format ; les erreurs ici sont
  broker-side).
- Un bouton **Cancel** signale aux workers d'arrêter de tirer de nouvelles lignes ; les
  publishes déjà émis ne sont pas annulables (pas de rollback côté broker). Le récap final
  expose `published`, `failed`, `canceled`, `remaining`.
- À la fin, l'événement `imported` remonté au parent déclenche un
  `queuesStore.refreshQueues()` pour rafraîchir les compteurs `messages_ready`.

### Tests

- `src/utils/csvImport.test.ts` (25 tests) : parser RFC 4180, `looksLikeBase64`,
  `detectHeader`, `validateAndMapRows`.
- `src/services/management.test.ts` (+6 tests) : nouvelle signature à options,
  `payload_encoding=base64`, merge des `properties` (notamment `message_id`).
- `src/components/ImportCsvPanel.test.ts` (9 tests) : rendu initial, parsing, détection
  header, base64, erreurs de format, publish concurrent, échecs partiels, `reset()`.
- `src/views/QueueDetailView.test.ts` (+4 tests) : présence de l'onglet, rendu du panneau,
  reset à la ré-entrée, `refreshQueues` sur `imported`.

## Alternatives considered

| Option | Why rejected |
|---|---|
| Bouton import par ligne dans `QueuesView` (modale) | Mêlait actions de la liste (création) et workflow contextuel à une queue ; dupliquait la sélection de queue alors que la queue est déjà sélectionnée naturellement par la navigation vers le détail. L'onglet `Import` regroupe toutes les opérations sur une queue (Details, Messages, Import) au même endroit. |
| Bouton import dans `QueueMessageList` à côté d'`Export` | Sémantiquement étrange : la liste lit, l'import écrit. Mélangeait deux directions de flux dans le même composant. L'onglet dédié sépare clairement les deux. |
| Modale au lieu d'un panneau inline | Surcharge UX (overlay, teleport, focus trap) pour un workflow potentiellement long avec progress bar. Le panneau inline tient dans la page et ne masque pas la navigation. |
| Republier via l'exchange/routing_key d'origine du CSV | Briserait l'invariant "import dans la queue cible" : un CSV exporté depuis un setup avec bindings multiples pourrait ne pas atteindre la queue choisie, ou se diffuser ailleurs. Le default exchange + `routing_key=queueName` garantit le routage vers exactement cette queue. |
| Préserver `routing_key`, `source exchange`, `headers`, `redelivered`, autres `properties` | Hors périmètre actuel ; demanderait de gérer la sérialisation JSON de structures imbriquées dans des cellules CSV (déjà problématique pour `headers` au format `Record<string, unknown>`). À reconsidérer si le besoin remonte explicitement. |
| Ne pas préserver `message_id` | `message_id` est le seul moyen, à l'issue d'un round-trip export/import, de retrouver les messages d'origine côté consommateur (idempotence, traçabilité). Le préserver coûte une option dans `properties` ; ne pas le faire perdrait toute fidélité du replay. |
| Header CSV obligatoire | L'export ADR 0008 rend le header optionnel via une checkbox ; un import strict aurait rejeté tout fichier exporté sans header. L'auto-détection garde la symétrie avec l'export et tolère les éditions manuelles. |
| Tout-ou-rien y compris pendant le publish (rollback) | RabbitMQ ne propose pas de rollback applicatif sur des publishes simples (transactions AMQP coûteuses, et certaines lignes pourraient déjà avoir été consommées). Pré-valider tout côté client puis publier sans rollback est le compromis le plus simple et prévisible. |
| Concurrence séquentielle (1 par 1) | Plus simple à raisonner mais inutilement lent sur un CSV de plusieurs centaines de lignes. La concurrence 10 est un sweet spot empirique : significativement plus rapide sans saturer ni le navigateur ni le broker. |
| Concurrence non bornée (`Promise.all`) | Risque de saturer le broker / le navigateur sur de gros CSV. Le pool borné garde un comportement prévisible. |
| Décoder/réencoder UTF-8 le `body` à l'import | Le broker a renvoyé `payload` brut dans `payload_encoding` correspondant ; reposter à l'identique garantit la fidélité bit-à-bit. L'auto-détection base64 traite le cas binaire sans intervention utilisateur. |
| Limite dure sur le nombre de lignes | Le batch est déjà borné par `count` côté fetch (ADR 0004). Imposer une limite arbitraire à l'import alors que l'export ne la propage pas créerait une asymétrie surprenante. La concurrence bornée + le panneau inline (sans freeze de l'UI) suffisent. |

## Consequences

**Positifs**
- Round-trip complet export ↔ import sur le même format CSV : un fichier produit par
  l'export est directement réimportable sans transformation.
- Préservation de `message_id` ⇒ rejouer un scénario reste traçable côté consommateur.
- Détection automatique base64 ⇒ les payloads binaires (que l'export sérialise en base64
  via le broker) sont correctement réinjectés sans intervention.
- Pré-validation tout-ou-rien : aucun publish partiel imputable au format du fichier.
- Concurrence bornée (10) + cancel : workflow utilisable même sur des batches de plusieurs
  centaines de messages, interruptible à tout moment.
- Onglet dédié dans `QueueDetailView` : la queue cible est non ambiguë (issue de la route),
  pas de risque de confusion avec une autre queue.

**Négatifs / contraintes**
- L'`exchange`, la `routing_key` et les autres `properties` du CSV ne sont pas restitués —
  un message importé n'est pas strictement "le même" message côté broker, juste un message
  équivalent au niveau payload + `message_id`. Documenté dans l'ADR.
- Pas de rollback : un publish émis ne peut pas être annulé. Le bouton `Cancel` n'arrête
  que les publishes restants.
- La détection base64 est heuristique (pattern + `atob`) : un payload texte qui aurait
  l'allure d'une chaîne base64 valide (ex. clé API ASCII de longueur multiple de 4) sera
  envoyé en `base64` et donc décodé côté broker. Cas extrême et facile à diagnostiquer
  via le récap, mais à connaître.
- L'élargissement du type `tab` (`'details' | 'messages' | 'import'`) impose toute
  évolution future (ex: persistance par query string) à intégrer le nouvel onglet.

**Actions de suivi**
- [doc/tech.MD](../tech.MD) mise à jour (Project Structure : `csvImport.ts`,
  `ImportCsvPanel.vue`).
- [README.md](../../README.md) mise à jour (feature list).
- Si le besoin de préserver `routing_key` / `source exchange` / `headers` émerge, créer
  un ADR de suivi qui étend le périmètre sans renommer les colonnes existantes.
- Si l'heuristique base64 produit des faux positifs gênants, exposer une option dans le
  panneau (`Body encoding: auto | string | base64`).
