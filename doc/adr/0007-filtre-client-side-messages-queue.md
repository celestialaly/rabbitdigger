# 7. Filtre client-side du tableau des messages d'une queue

- **Date**: 2026-04-25
- **Status**: Accepted

## Context

L'[ADR 0004](./0004-lister-messages-queue.md) décrit en *Phase 3* un ensemble de filtres
client-side pour le composant `QueueMessageList` (full-text body avec debounce, routing key
substring + regex, header `key=value`, taille payload min/max). Cette spec n'avait pas encore
été implémentée.

Le besoin opérationnel remonté est plus simple : pendant une session de debug, l'utilisateur
veut **réduire visuellement** un batch déjà chargé pour repérer les messages qui contiennent
une chaîne (un identifiant de commande, une routing key partielle, un nom d'exchange) sans
avoir à re-fetch ni à scroller. Toutes les variantes plus avancées de la Phase 3 (regex,
filtres header, bornes de taille) ne sont pas demandées aujourd'hui et ajoutent de la
complexité UI + cas d'erreur (regex invalide, parsing `key=value`).

## Decision

Livrer une version minimale du filtrage client-side, conforme à l'esprit de la Phase 3 de
l'ADR 0004 mais avec un périmètre réduit :

- Un unique champ `v-text-field` `Filter messages` au-dessus du `v-data-table`,
  `prepend-inner-icon=mdi-filter-variant`, `clearable`.
- Le filtre est **appliqué uniquement aux résultats déjà fetch** (pas de refetch broker, pas
  de debounce nécessaire — Vue recalcule le `computed` instantanément).
- Recherche **substring, case-insensitive**, sur la concaténation `payload décodé +
  routing_key + exchange`. Pas de regex.
- Le compteur du header passe de `N message(s)` à `M / N message(s)` pour rendre visible la
  réduction.
- Champ désactivé tant qu'aucun fetch n'a été effectué (`store.messages.length === 0`).
- Empty-state du tableau différencié : "No messages — click Fetch…" si le batch est vide,
  "No messages match the current filter." si le filtre exclut tout.
- Pas de nouveau composable : la logique tient en un `computed` de quelques lignes dans
  `QueueMessageList.vue`. Extraction dans `useMessageFilters` reportée si/quand un second
  type de filtre est ajouté (YAGNI).

## Alternatives considered

| Option | Why rejected |
|---|---|
| Implémenter intégralement la Phase 3 d'ADR 0004 (regex, header `key=value`, bornes bytes) | Hors périmètre du besoin actuel, coût UI + tests + gestion d'erreur (regex invalide) non justifié pour une session de debug. Reportable sans dette si le besoin émerge. |
| Filtre serveur via re-fetch debounced | Déjà rejeté par ADR 0004 : chaque keystroke = un `/get` qui requeue le batch, perd l'ordre, marque `redelivered`. Le filtre mémoire est instantané et préserve le batch. |
| Composable `useMessageFilters` dès maintenant | Une seule règle de filtrage, un seul composant consommateur. Extraction prématurée. À créer quand on ajoute le 2e filtre. |
| Filtrer aussi sur les headers / properties | Non demandé. Les headers sont déjà visibles via l'expand-row ; les inclure dans la haystack rendrait le matching imprévisible (objets sérialisés). |

## Consequences

**Positifs**
- Réduction visuelle immédiate d'un batch sans coût broker ni perte d'ordre / `redelivered`.
- Compteur `M / N` rend la couverture explicite.
- Empty-state distinct évite la confusion "rien dans la queue" vs "rien ne matche".
- Implémentation minimale : ~20 lignes de template/script, 3 tests dédiés.

**Négatifs / contraintes**
- Pas de regex, pas de filtre header dédié, pas de bornes payload : si le besoin émerge, un
  ADR de suivi étendra le périmètre.
- Le filtre s'applique uniquement au batch en mémoire ; pour explorer plus de messages,
  l'utilisateur doit augmenter `count` et re-fetcher (cohérent avec ADR 0004).

**Actions de suivi**
- Mettre à jour [doc/tech.MD](../tech.MD) (fait dans ce changeset).
- Si un besoin de regex / filtre header remonte, créer un ADR qui supersede partiellement
  celui-ci et extraire alors `useMessageFilters`.
