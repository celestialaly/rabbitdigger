# 1. Stratégie de tests

- **Date** : 2026-04-24
- **Statut** : Accepté

## Contexte

L'application présente une erreur « WebSocket connection failed » sur la page `/connect`.
Avant toute correction, nous voulons une suite de tests qui :

1. **reproduise le bug** de manière déterministe — un test rouge sert de critère de succès du fix ;
2. **couvre les régressions futures** sur les deux protocoles utilisés (REST Management + WebStomp) ;
3. **reste rapide** à l'exécution locale et en CI.

Le projet utilise Vue 3 + Vite + Vuetify 3 + Pinia + Vue Router + `@stomp/stompjs`, sans backend
intermédiaire (le navigateur parle directement à RabbitMQ via le proxy Vite pour la partie REST,
et directement en WebSocket pour STOMP).

## Décision

Trois niveaux de tests, chacun avec un outil dédié.

### 1. Tests unitaires & composants — Vitest + Vue Test Utils + happy-dom

- **Vitest** : recommandé par l'équipe Vue/Vite, partage le pipeline de transformation Vite
  (zéro config dupliquée), API compatible Jest, watch mode rapide.
- **Vue Test Utils** : API officielle de montage de composants Vue 3.
- **happy-dom** : DOM virtuel ~2× plus rapide que jsdom, suffisant pour Vuetify (avec quelques
  stubs : `ResizeObserver`, `matchMedia`, `CSS.supports`).
- **`@pinia/testing`** : `createTestingPinia()` pour les tests de composants ; `createPinia()`
  + `setActivePinia()` pour les tests de stores purs.
- **Co-location** : `Foo.ts` ↔ `Foo.test.ts` dans le même dossier.
- **Mocks** :
  - `vi.mock('@stomp/stompjs')` pour tester le wrapper STOMP sans WebSocket réelle ;
  - `vi.fn()` sur `globalThis.fetch` pour le client REST ;
  - `vi.mock('vue-router')` pour intercepter `useRouter().push`.

Configuration : [vitest.config.ts](../../vitest.config.ts) + [src/test/setup.ts](../../src/test/setup.ts).

## Alternatives considérées

| Option | Pourquoi écartée |
|---|---|
| **Jest** | Demande `vue-jest` + Babel, plus lent avec Vite, config dupliquée. |
| **jsdom** | Plus lent que happy-dom pour un gain de compatibilité non requis ici. |


## Conséquences

**Positives**
- Une seule config Vite partagée par dev / build / test.
- Mocks ciblés : les tests unitaires restent rapides et indépendants du broker.

**Négatives / à surveiller**
- Les tests e2e nécessitent que `docker compose up` soit en cours — à documenter dans le README
  et à automatiser en CI.
- Vuetify exige des stubs DOM dans [src/test/setup.ts](../../src/test/setup.ts) ; à étendre si
  d'autres APIs manquantes apparaissent.
- `@pinia/testing` est ici figé en `^0.1.x` car la version `1.x` requiert Pinia 3 ; à revoir lors
  d'une éventuelle montée de version.

## Commandes

```bash
# Tests unitaires & composants
yarn test            # mode watch
yarn test:run        # une seule passe
yarn test:coverage   # avec couverture

```

## Références

- <https://vuejs.org/guide/scaling-up/testing>
- <https://vitest.dev/>
- <https://test-utils.vuejs.org/>
