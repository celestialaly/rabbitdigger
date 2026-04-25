# RabbitDigger — Technical Documentation

## Overview

RabbitDigger is a browser-based developer tool for exploring and interacting with a RabbitMQ cluster. It lets you monitor cluster health and resource usage, browse queues and exchanges, publish messages, and consume messages in real time.

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| UI Framework | Vue 3 | ^3.5 |
| Language | TypeScript | ~5.7 |
| Build tool | Vite | ^6 |
| Component library | Vuetify 3 | ^3.7 |
| State management | Pinia | ^2.3 |
| Client-side routing | Vue Router | ^4.5 |
| Real-time messaging | @stomp/stompjs | ^7.0 |
| HTTP client | Native Fetch API | — |
| Unit / component tests | Vitest + @vue/test-utils + happy-dom | ^4 / ^2 / ^20 |
| Pinia test helper | @pinia/testing | ^0.1 |
| End-to-end tests | Playwright (Chromium) | ^1.59 |
| Package manager | Yarn | v4 (Berry, runs in container) |
| Container runtime | Docker / Compose | v2 (required for all commands) |

---

## Architecture

The frontend communicates with RabbitMQ using two distinct protocols:

```
Browser
  ├── REST  (Fetch) → /__rabbit → Vite middleware → http://{host}:{managementPort}
  └── STOMP (WebSocket) → ws://{host}:{stompPort}/ws
```

The `/__rabbit` middleware (defined in [vite.config.ts](../vite.config.ts))
forwards every REST call to the broker URL the browser passes via the
`X-Rabbit-Target` header. This keeps the call same-origin from the browser’s
point of view, so **no CORS configuration is required on the target broker**
(see ADR 0006). The STOMP WebSocket connects directly because CORS does not
apply to WebSockets.

### Why two protocols?

**RabbitMQ Management REST API** (default port 15672, plugin: `rabbitmq_management`)
- Read cluster metadata: queues, exchanges, bindings, node stats, message rates
- Publish messages via HTTP (`POST /api/exchanges/{vhost}/{exchange}/publish`)
- Read messages from a queue (`POST /api/queues/{vhost}/{name}/get`, non-destructive by default — see ADR 0004)
- Does not support real-time streaming — polling required

**WebStomp** (default port 15674, plugin: `rabbitmq_web_stomp`)
- WebSocket transport layered over the STOMP protocol
- Real-time message consumption: subscribe to a queue and messages arrive as events
- Supports ack / nack per message
- Cannot list queues/exchanges — only messaging operations

Neither protocol alone is sufficient for this tool, so both are used together.

---

## Project Structure

```
rabbitdigger/
├── doc/
│   ├── tech.MD                      # This file
│   └── adr/                         # Architecture Decision Records
├── e2e/
│   └── connect.spec.ts              # Playwright end-to-end tests
├── src/
│   ├── test/
│   │   └── setup.ts                 # Vitest global setup (Vuetify DOM stubs)
│   ├── components/
│   │   ├── StatCard.vue             # Reusable metric card
│   │   ├── ExportCsvDialog.vue      # Modal to configure CSV export options (ADR 0008)
│   │   └── QueueMessageList.vue     # Fetches, filters, exports & renders messages of a queue (ADR 0004 P1, ADR 0007, ADR 0008)
│   ├── views/
│   │   ├── ConnectView.vue          # Connection form (entry point)
│   │   ├── DashboardView.vue        # Cluster overview, polled every 5s
│   │   ├── QueuesView.vue           # Queue list with search
│   │   ├── QueueDetailView.vue      # Queue detail with Détails / Messages tabs (ADR 0004)
│   │   ├── ExchangesView.vue        # Exchange list with search
│   │   ├── PublishView.vue          # Publish a message via REST API
│   │   └── ConsumeView.vue          # Subscribe to a queue via STOMP
│   ├── services/
│   │   ├── management.ts            # Fetch API wrapper for REST Management API
│   │   └── stomp.ts                 # @stomp/stompjs singleton client
│   ├── stores/
│   │   ├── connection.ts            # Pinia: broker settings + connection state
│   │   ├── queues.ts                # Pinia: queue/exchange data cache
│   │   ├── queueMessages.ts         # Pinia: messages fetched from /api/queues/.../get (ADR 0004)
│   │   └── messages.ts              # Pinia: consumed message ring-buffer (max 200)
│   ├── utils/
│   │   ├── nanoid.ts                # Tiny ID generator (no dependency)
│   │   ├── csv.ts                   # RFC 4180 CSV serializer (ADR 0008)
│   │   └── decodePayload.ts         # Decode RabbitMQ payload string|base64 → text + binary flag
│   ├── router/index.ts              # Vue Router — guards redirect to /connect if not connected
│   ├── App.vue                      # Root: nav drawer + <router-view>
│   └── main.ts                      # App bootstrap (Vue + Pinia + Router + Vuetify)
├── docker/
│   vitest.config.ts                 # Vitest config (happy-dom, aliases, coverage)
├── playwright.config.ts             # Playwright config (no webServer — see ADR 0001)
├── └── rabbitmq/
│       └── enabled_plugins          # Erlang term: enables management + web_stomp
├── docker-compose.yml
├── Dockerfile.dev
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## RabbitMQ Plugins

Two plugins are used by the broker:

| Plugin | Purpose | Required? |
|---|---|---|
| `rabbitmq_management` | REST API on port 15672, Management UI | **Yes** — the app cannot connect without it |
| `rabbitmq_web_stomp` | WebSocket/STOMP on port 15674 | Optional — see [ADR 0005](./adr/0005-degradation-gracieuse-stomp.md). If absent, the app still works but the *Consume* page shows a disabled-state alert. |

The file `docker/rabbitmq/enabled_plugins` is mounted into the container at `/etc/rabbitmq/enabled_plugins` and contains:

```erlang
[rabbitmq_management,rabbitmq_web_stomp].
```

---

## Default Queue

A queue named `default` is pre-created in RabbitMQ at container startup via the native
[definitions](https://www.rabbitmq.com/docs/definitions) mechanism. It is **durable**,
non-auto-delete, on vhost `/`.

Two files are mounted into the `rabbitmq` container:

| Host path | Container path | Purpose |
|---|---|---|
| `docker/rabbitmq/rabbitmq.conf` | `/etc/rabbitmq/rabbitmq.conf` | Points RabbitMQ to the definitions file |
| `docker/rabbitmq/definitions.json` | `/etc/rabbitmq/definitions.json` | Declares the `default` queue |

> **Note:** RabbitMQ only loads definitions on a **fresh data volume**. If `rabbitmq_data`
> already exists, run `docker compose down -v && docker compose up -d` to reinitialise it.

---

## Running in Development

### Prerequisites

- Docker and Docker Compose v2 (only requirement on the host)

Node and Yarn are **not** installed on the host: every command runs inside the `app` container.
See [ADR 0002](./adr/0002-execution-via-docker.md) for the rationale.

### Start everything

```bash
docker compose up -d
```

This starts:
- **app** — Vite dev server with HMR at http://localhost:5173 (the container's `CMD` is
  `yarn dev --host`)
- **rabbitmq** — RabbitMQ broker; the `app` service waits for it to be healthy

### Useful URLs

| Service | URL | Credentials |
|---|---|---|
| App | http://localhost:5173 | — |
| RabbitMQ Management UI | http://localhost:15672 | guest / guest |
| AMQP | localhost:5672 | guest / guest |
| WebStomp | ws://localhost:15674/ws | guest / guest |

### Running yarn / npx commands

All project commands (yarn, vue-tsc, vitest, …) run inside the `app` container. Suggested
shell alias:

```bash
alias drd='docker compose exec app'
drd yarn install     # refresh deps
drd yarn build       # vue-tsc + Vite
drd yarn test:run    # unit + component tests
```

One-shot fallback when `app` is not running: `docker compose run --rm app yarn <cmd>`.

## Testing

The project uses a three-tier testing strategy. Rationale and alternatives considered are
documented in [ADR 0001](./adr/0001-strategie-de-tests.md).

| Tier | Tooling | Location |
|---|---|---|
| Unit | Vitest + happy-dom | `src/**/*.test.ts` (co-located with source) |
| Component | Vitest + @vue/test-utils + Vuetify + @pinia/testing | `src/views/*.test.ts`, `src/components/*.test.ts` |
| End-to-end | Playwright (Chromium) | `e2e/*.spec.ts` |

### Commands

Vitest commands run inside the container (see ADR 0002):

```bash
drd yarn test            # Vitest in watch mode
drd yarn test:run        # Vitest single run (used in CI)
drd yarn test:coverage   # Vitest with v8 coverage report
```

Playwright (e2e) currently runs **on the host** — the Alpine-based image does not support it.
A future ADR will revisit this. The docker stack must be up so the dev server and broker are
reachable:

```bash
docker compose up -d
yarn test:e2e            # on the host
```

First-time Playwright browser install on the host:

```bash
npx playwright install chromium
```

### Conventions

- **Co-locate** unit and component tests next to the file under test (`Foo.ts` → `Foo.test.ts`).
- **Mock external boundaries** only: `@stomp/stompjs`, `globalThis.fetch`, `vue-router`. Do not
  mock internal modules unless strictly necessary.
- **Pinia in component tests**: use `createTestingPinia({ stubActions: false })` from
  `@pinia/testing`. For pure store tests, use `setActivePinia(createPinia())`.
- **Vuetify**: components must be mounted with a `createVuetify()` plugin; DOM stubs
  (`ResizeObserver`, `matchMedia`, `CSS.supports`) live in `src/test/setup.ts`.
- **E2E** assume `docker compose up` is running — no `webServer` is configured in Playwright,
  see ADR 0001 for the rationale.

---

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `VITE_RABBIT_HOST` | `localhost` | Hostname pre-filled in the connection form |

Copy `.env.example` to `.env` to override locally.

---

## Connecting to a Remote / Production Cluster

1. On the connection form, replace `localhost` with your broker's hostname or IP.
2. Ensure ports 15672 (Management) and 15674 (WebStomp) are reachable from the browser.
3. If the broker is behind a reverse proxy, configure it to forward WebSocket upgrades to port 15674.
4. For TLS: use `wss://` — update `stomp.ts`'s `brokerURL` accordingly and ensure the Management API is served over HTTPS.

---

## Key Design Decisions

- **No backend proxy**: The app talks directly to RabbitMQ from the browser. This keeps the stack minimal and avoids an extra hop. CORS is handled by the Vite proxy in development; in production the app should be served from a reverse proxy that forwards `/api` to the broker.
- **Native Fetch API**: No HTTP client library needed — the Management API uses standard JSON over HTTP, and Fetch covers all required features.
- **Ring-buffer for consumed messages**: The messages store caps at 200 entries to prevent unbounded memory growth during long consumption sessions.
- **Dark theme by default**: Vuetify is initialised with `defaultTheme: 'dark'` — suitable for developer tooling.
- **Optional STOMP plugin**: Capability is detected at connection time via `/api/overview`'s listeners. When `rabbitmq_web_stomp` is missing, the connection still succeeds and REST-only features remain usable; only `ConsumeView` degrades to an info alert. See [ADR 0005](./adr/0005-degradation-gracieuse-stomp.md).
