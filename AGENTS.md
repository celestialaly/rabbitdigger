# AGENTS.md

Operating instructions for AI coding agents working on **RabbitDigger**.
Read this file fully before making changes. For protocol/architecture details, see
[doc/tech.MD](doc/tech.MD); for past architectural choices, see [doc/adr/](doc/adr/).

---

## 0. Docker-first execution environment

**All project commands run inside the `app` container, never on the host.** This includes
`yarn`, `npx`, `vue-tsc`, `vitest`, and any other Node tool. The host is not expected to have
Node, Yarn, or any project dependency installed. Rationale: see
[ADR 0002](doc/adr/0002-execution-via-docker.md).

### Bring up the stack

```bash
docker compose up -d         # builds the image on first run, then starts app + rabbitmq
```

`app` runs `yarn dev --host` as its `CMD`, so Vite is already serving on
http://localhost:5173 as soon as the container is up. You do **not** need to start it manually.

### Run a command in the container

Suggested shell alias (add it to your `~/.zshrc` / `~/.bashrc`):

```bash
alias drd='docker compose exec app'
```

Then every `yarn <cmd>` in this document means `drd yarn <cmd>`. Examples:

```bash
drd yarn install          # refresh deps after pulling
drd yarn test:run         # unit + component tests
drd yarn build            # vue-tsc --noEmit + Vite build
drd yarn lint
```

If the `app` container is not running (or you want a one-shot invocation that doesn't depend
on it), use the slower fallback:

```bash
docker compose run --rm app yarn <cmd>
```

---

## 1. Tech stack at a glance

Vue 3 + TypeScript + Vite + Vuetify 3 + Pinia + Vue Router + `@stomp/stompjs`.
Tests: Vitest + Vue Test Utils + happy-dom (unit/component).
Package manager: **Yarn (Berry, v4)**. Always use `yarn`, never `npm install`. Yarn runs inside
the `app` container (see section 0).

---

## 2. Vue & Composition API rules (mandatory)

These rules are **non-negotiable**. Do not introduce code that violates them; if you find
violating code, prefer fixing it within the scope of your change rather than copying the pattern.

- **Composition API only.** Always use `<script setup lang="ts">`. Do not write Options API
  (`data()`, `methods`, `computed: {}`, `this.foo`). If you encounter Options API code,
  migrate it when touching the file.
- **TypeScript everywhere.** No plain `.js` files. Every `.vue` file must use
  `<script setup lang="ts">`. Public functions and store state must be typed; do not rely on
  inference for exported symbols.
- **Pinia stores in setup style.** Define stores as `defineStore('name', () => { ... })`
  returning `ref`s and functions. Do not use the options-object form.
- **Typed props with `defineProps<T>()`.** Use the generic, type-only form:
  ```ts
  const props = defineProps<{ title: string; count?: number }>()
  ```
  Use `withDefaults()` for optional defaults. Same rule for `defineEmits<{ ... }>()`.
- **Reactive state via `ref` / `reactive` / `computed`.** Never reach for `this`.
  Prefer `ref` for primitives and shallow objects; `reactive` for grouped state.
- **Composables over mixins.** Cross-component logic goes into `src/composables/use*.ts`
  files (create the folder if needed). Each composable returns plain reactive primitives.
- **Effects must be cleaned up.** Use `onUnmounted` / `watchEffect` `onCleanup` to release
  intervals, subscriptions, STOMP handlers, etc.
- **Imports use the `@/` alias** (configured in `vite.config.ts` and `tsconfig.app.json`).
  Do not use long relative paths like `../../../stores/...`.

---

## 3. Testing is mandatory

Every code change must ship with tests. No exceptions for "trivial" changes — if it is trivial
to write, it is trivial to test.

### What to test (minimum)

| Change type | Required tests |
|---|---|
| New Pinia store | Unit tests covering every action and state transition |
| New service / wrapper (`src/services/*`) | Unit tests with the external boundary mocked (`@stomp/stompjs`, `fetch`, etc.) |
| New view / component | Component test mounting with `@vue/test-utils` + Vuetify; cover happy path + at least one error path |
| Bug fix | A regression test that **fails before the fix** and passes after |
| Refactor with no behavior change | Existing tests must still pass; add coverage where missing |

### Conventions

- **Co-locate** unit and component tests next to the source file: `Foo.ts` ↔ `Foo.test.ts`.
- **Mock only at boundaries.** Acceptable mocks: `@stomp/stompjs`, `globalThis.fetch`,
  `vue-router`. Do not mock our own modules unless strictly required.
- **Pinia in component tests:** use `createTestingPinia({ createSpy: vi.fn, stubActions: false })`.
- **Pinia in store tests:** `setActivePinia(createPinia())` in `beforeEach`.
- **Vuetify in component tests:** mount with a `createVuetify({ components, directives })`
  plugin. DOM stubs (`ResizeObserver`, `matchMedia`, `CSS.supports`) live in
  [src/test/setup.ts](src/test/setup.ts).
- **No snapshot-only tests.** Snapshots may complement assertions, never replace them.

### Running tests

Always run the relevant suite before declaring work done. Per section 0, Vitest commands run
inside the container (`drd` = `docker compose exec app`):

```bash
# Unit + component (fast, run on every change)
drd yarn test:run

# Watch mode while iterating
drd yarn test

# Coverage report (run before merging significant changes)
drd yarn test:coverage
```

**Acceptance bar:** `yarn test:run` must be green.

---

## 4. Documentation is part of the feature

Every feature, change, or bug fix that alters behavior or architecture **must** update both:

### 4.1 Update [doc/tech.MD](doc/tech.MD)

Update `tech.MD` whenever you change:
- the dependency list (add/remove/upgrade a library that appears in the Tech Stack table);
- the project structure (new top-level folder, renamed view, new service);
- the testing strategy or commands;
- the runtime / environment variables / ports / plugins;
- any "Key Design Decisions" entry.

Keep edits surgical: do not rewrite unrelated sections.

### 4.2 Add an ADR under [doc/adr/](doc/adr/)

Create a new ADR (Architecture Decision Record) for any of the following:

- **Any new user-facing feature.**
- **Any change to architecture** — protocols, layering, module structure, communication
  patterns, build pipeline, deployment model.
- **Any change to the testing strategy** — new framework, new test tier, new mocking policy.

ADR file naming: `doc/adr/NNNN-kebab-case-title.md` where `NNNN` is the next free number
(check the existing folder; do not reuse numbers).

ADR template (always use this structure):

```markdown
# N. Title

- **Date**: YYYY-MM-DD
- **Status**: Proposed | Accepted | Superseded by ADR-XXXX

## Context
What forces are at play? What problem are we solving?

## Decision
What did we decide? Be concrete and prescriptive.

## Alternatives considered
| Option | Why rejected |
|---|---|

## Consequences
Positive, negative, and follow-up actions.
```

After creating the ADR, add a row to the table in [doc/adr/README.md](doc/adr/README.md).

---

## 5. Definition of Done

A change is ready for review only when **all** of these are true:

- [ ] Code follows the Vue/Composition rules in section 2.
- [ ] New or changed behavior is covered by tests at the appropriate tier (section 3).
- [ ] `drd yarn test:run` is green locally.
- [ ] `drd yarn build` succeeds (`vue-tsc --noEmit` + Vite build).
- [ ] `doc/tech.MD` is updated if anything in section 4.1 applies.
- [ ] An ADR is added under `doc/adr/` if anything in section 4.2 applies.
- [ ] No unrelated reformatting, no new dependencies "just in case", no dead code.

---

## 6. House-keeping rules

- **Never run `yarn` directly on the host.** All project commands go through the `app` container
  (section 0).
- **Do not commit secrets.** Credentials in tests must be the default `guest` / `guest`.
- **Do not bypass safety hooks** (`--no-verify`, `--force`, `git reset --hard` on shared work).
- **Prefer editing existing files over creating new ones.** Especially for documentation.
- **Ask before** deleting files, dropping data, or running destructive shell commands.
