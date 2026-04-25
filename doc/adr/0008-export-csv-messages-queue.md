# 8. Export CSV des messages d'une queue

- **Date**: 2026-04-25
- **Status**: Accepted

## Context

Une fois un batch de messages chargé via `QueueMessageList` (ADR 0004) et restreint via le
filtre client-side (ADR 0007), l'utilisateur en session de debug veut **partager ou
archiver** la sélection en dehors de l'UI : ouverture dans un tableur, diff, attachement à
un ticket, copie dans un rapport. Le clic-droit / copier-coller depuis le tableau est
laborieux et perd la structure (notamment quand le payload contient des virgules ou des
sauts de ligne).

L'API Management RabbitMQ ne propose pas d'export tabulaire ; toute la data nécessaire est
déjà en mémoire côté client après un fetch.

## Decision

Livrer un export **CSV client-side** déclenché depuis `QueueMessageList` :

- Bouton **Export CSV** (`mdi-file-export`) à côté du bouton *Fetch*, désactivé tant que
  `filteredRows.length === 0`.
- Au clic, ouverture d'une modale Vuetify `ExportCsvDialog.vue` exposant :
  - une bannière d'info `Queue: <name> — N message(s) to export` ;
  - un champ `separator` (défaut `,`, `maxlength=1`) ;
  - un champ `delimiter` (défaut `"`, `maxlength=1`, sémantique = caractère de quoting
    RFC 4180, échappé par doublement) ;
  - une checkbox `Include header row` (défaut coché) ;
  - boutons `Cancel` / `Export`. `Export` est désactivé si `separator` ou `delimiter`
    n'est pas exactement 1 caractère, ou si les deux sont identiques.
- Sérialisation par un utilitaire pur `src/utils/csv.ts` (`toCsv`) :
  - quoting **conditionnel** (RFC 4180) : champ entouré uniquement s'il contient le
    `separator`, le `quote`, `\n` ou `\r` ;
  - quote interne échappée par doublement ;
  - records joints par `\r\n`.
- **Périmètre exporté** : `filteredRows` uniquement (pas le batch complet ni les messages
  non chargés).
- **Colonnes fixes** (ordre figé) :

  | Colonne | Source |
  |---|---|
  | `id` | `properties.message_id` (chaîne vide si absent) |
  | `size` | `payload_bytes` |
  | `body` | `payload` brut tel que renvoyé par le broker (string ou base64 selon `payload_encoding`) |
  | `routing key` | `routing_key` |
  | `source queue` | nom de la queue courante (`props.queueName`) |
  | `source exchange` | `exchange` du message |

- Téléchargement via `Blob` + `URL.createObjectURL` + `<a download>` ; nom du fichier
  `messages-<queue-sanitized>-<YYYYMMDD-HHmmss>.csv`. L'URL est révoquée après le clic
  programmatique.
- Tests : suite dédiée `csv.test.ts` (sérialisation + validation), `ExportCsvDialog.test.ts`
  (rendu + émission de `confirm`), et 5 nouveaux tests dans `QueueMessageList.test.ts`
  (bouton désactivé, ouverture modale, contenu du Blob avec/sans header, périmètre filtré).
- Stub `visualViewport` ajouté à `src/test/setup.ts` (requis par la stratégie de location
  de `VOverlay` que `v-dialog` utilise sous happy-dom).

## Alternatives considered

| Option | Why rejected |
|---|---|
| Export côté serveur via une API broker | RabbitMQ ne propose pas d'endpoint d'export tabulaire ; il faudrait un service intermédiaire dédié — disproportionné. Toute la data nécessaire est déjà côté client. |
| Export JSON ou NDJSON | Le besoin remonté est d'ouvrir le résultat dans un tableur. JSON est lisible mais demande une conversion supplémentaire pour Excel/LibreOffice. CSV répond directement. |
| Inclure properties / headers / `redelivered` dans le CSV | Hors périmètre du besoin actuel ; rendrait les colonnes variables (set de headers != par message) ou imposerait une sérialisation JSON imbriquée par cellule. À revoir si le besoin émerge. |
| Décoder le payload binaire en texte UTF-8 | `body` doit refléter ce que le broker a renvoyé pour rester réversible et déterministe. Le décodage UTF-8 best-effort de l'UI (`decodePayload`) est destiné à l'affichage et perd la donnée pour les payloads non-UTF-8. Conserver `payload` brut (base64 quand le broker l'a indiqué) garantit l'intégrité. |
| Toujours quoter tous les champs | Plus simple à coder mais alourdit le fichier et déroge au comportement RFC 4180 attendu par les tableurs. Le coût du quoting conditionnel est négligeable (une fonction pure de quelques lignes). |
| Sélection des colonnes côté UI | Pas de demande utilisateur ; ajouterait une matrice de cas (ordre, persistance) sans valeur immédiate. Les colonnes fixes répondent au besoin. |
| BOM UTF-8 pour Excel | Non demandé ; ajoute une subtilité d'encodage qui peut casser d'autres consommateurs. À ajouter ultérieurement (option dans la modale) si un utilisateur Excel le réclame. |

## Consequences

**Positifs**
- Export self-service de la sélection en cours, sans aller-retour broker ni dépendance
  externe.
- Fichier CSV conforme RFC 4180 : ouvrable tel quel dans Excel / LibreOffice / `csv.reader`
  Python, payloads multi-lignes correctement quotés.
- `body` brut + `payload_bytes` permettent de retrouver exactement la donnée broker
  (utile pour les payloads binaires : on conserve la base64).
- Utilitaire `toCsv` pur, réutilisable pour de futurs exports (queues, exchanges, etc.).
- 22 nouveaux tests garantissent le comportement (sérialisation, modale, bouton, scope
  filtré, header on/off).

**Négatifs / contraintes**
- Pour les payloads binaires, l'utilisateur reçoit du base64 dans `body` — clair mais à
  documenter si une question remonte.
- Aucune limite explicite sur le volume exporté ; le batch est borné par `count` côté
  fetch (cohérent avec ADR 0004), mais un batch de plusieurs milliers de messages générera
  un Blob proportionnel en mémoire.
- Le stub `visualViewport` est partagé par toute la suite test et pourrait masquer un
  futur bug Vuetify lié au viewport ; acceptable car happy-dom n'expose pas l'API.

**Actions de suivi**
- [doc/tech.MD](../tech.MD) mise à jour (Project Structure).
- Si le besoin d'inclure properties / headers ou de choisir les colonnes émerge, créer un
  ADR de suivi qui étend le périmètre sans renommer les colonnes existantes.
- Si Excel UTF-8 pose problème, exposer une option `Add UTF-8 BOM` dans la modale.
