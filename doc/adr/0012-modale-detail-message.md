# 12. Modale de détail d'un message

- **Date**: 2025-11-24
- **Statut**: Accepté

## Contexte

Le tableau des messages d'une queue (`QueueMessageList.vue`) n'affichait qu'une
ligne tronquée du body, des propriétés et des headers. Pour consulter le contenu
complet d'un message — typiquement vérifier un payload de plusieurs centaines
d'octets ou inspecter les headers AMQP — l'utilisateur devait passer par le
mécanisme natif `show-expand` de Vuetify : une petite icône de chevron en début
de ligne.

Deux limites observées :

- Le chevron est peu visible et la zone cliquable est étroite ; les utilisateurs
  ratent fréquemment l'interaction.
- L'expansion de ligne réutilise la largeur du tableau, qui est elle-même
  contrainte par la grille principale. Un body un peu long (JSON, XML, trace)
  est rapidement illisible.

## Décision

Remplacer le `show-expand` + `#expanded-row` par une **interaction "ligne
entière cliquable" qui ouvre une modale `MessageDetailDialog`** dédiée au détail
d'un message.

Comportement :

- La `<v-data-table>` n'utilise plus `show-expand`. Toutes les lignes reçoivent
  `cursor: pointer` via `row-props` et un handler `@click:row` mémorise le
  message sélectionné puis ouvre la modale.
- Le composant `MessageDetailDialog.vue` (max-width 900, scrollable) affiche :
  - un tableau récapitulatif (message_id, routing key, exchange, encoding,
    bytes, redelivered) ;
  - le body complet décodé via `decodePayload`, dans un `<pre>` avec
    `white-space: pre-wrap` et `word-break: break-all` ;
  - un bloc Properties qui exclut le champ `headers` (rendu séparément) ;
  - un bloc Headers ;
  - un chip "binary (base64)" lorsque le payload n'est pas du texte UTF-8 ;
  - un bouton de copie du body décodé via `navigator.clipboard.writeText`.
- Le bouton de fermeture et l'icône `mdi-close` émettent
  `update:modelValue=false`. La modale supporte `v-model` (interface standard
  Vuetify).

## Alternatives considérées

| Option | Pourquoi rejetée |
|---|---|
| Garder `show-expand` et ne changer que le style du chevron | N'élargit pas la zone d'affichage du body ; l'expansion reste contrainte par la largeur du tableau. |
| Page dédiée par message (route `/queues/:name/messages/:id`) | Surdimensionné : les messages "peeked" n'ont pas d'identifiant stable côté broker (la lecture est destructive ou requiert un requeue). Une route persistante serait trompeuse. |
| Drawer latéral plutôt qu'une modale | La queue est déjà dans un onglet ; ajouter un drawer empile les overlays. La modale centrée est cohérente avec `ExportCsvDialog` et `CreateQueueDialog`. |

## Conséquences

**Positives**
- Affordance évidente : toute la ligne est cliquable, le curseur change au survol.
- Espace dédié au body : la modale (900 px) accueille bien plus de contenu que la ligne du tableau.
- Bouton de copie intégré, utile pour tester un payload dans un autre outil.

**Négatives**
- Une frappe sur une ligne déclenche désormais l'ouverture de la modale ; il
  n'est plus possible de garder plusieurs messages "ouverts" en parallèle comme
  le permettait `show-expand`. Acceptable au vu du faible usage observé.

**Suivi**
- Si un besoin de comparaison côte-à-côte de deux messages émerge, envisager un
  mode "épingler" qui copierait un message vers un panneau latéral.
