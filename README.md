# RabbitDigger

A browser-based developer tool for exploring, monitoring, and interacting with RabbitMQ clusters. It talks directly to RabbitMQ using the Management REST API (port 15672) for metadata and message inspection, and the WebStomp plugin (port 15674) for real-time consumption — no backend proxy needed.

---

## Features

- **Dashboard** — Cluster overview with real-time stats (queues, consumers, message rates, connections), auto-refreshed every 5 seconds.
- **Queues** — Browse and search all queues; view name, state, durability, message counts, and consumer count. Create a new queue (classic / quorum / stream) directly from the list.
- **Queue detail** — Inspect queue metadata and read messages non-destructively (requeue option keeps messages in place).
  - Client-side substring filtering of fetched messages.
  - Export messages to CSV with configurable separator and quote character.
- **Exchanges** — Browse all exchanges and their properties.
- **Publish** — Send messages to any exchange with a custom routing key, body, and optional headers.
- **Consume** — Subscribe to a queue and receive messages in real time via STOMP/WebSocket. Per-message ACK/NACK. Degrades gracefully when the WebStomp plugin is unavailable.
- **Session continuity** — Connection form pre-fills automatically after a refresh and the app returns to the last visited view once you re-enter your password. The password itself is **never** persisted (see [ADR 0009](doc/adr/0009-persistance-session-sans-password.md)). The session expires after 5 minutes of inactivity (mouse / keyboard / scroll / touch).

---

## Production deployment

### 1. Build the static assets

```bash
docker compose run --rm app yarn build
# Output: dist/
```

### 2. Serve `dist/` with any static file server

Example with nginx:

```nginx
server {
    listen 80;
    root /path/to/dist;
    index index.html;
    location / { try_files $uri $uri/ /index.html; }
}
```

### 3. RabbitMQ requirements

| Plugin | Port | Required? |
|---|---|---|
| `rabbitmq_management` | 15672 | Yes |
| `rabbitmq_web_stomp` | 15674 | Optional (real-time consume only) |

Both plugins are enabled in [`docker/rabbitmq/enabled_plugins`](docker/rabbitmq/enabled_plugins).

### 4. Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `VITE_DEFAULT_HOST` | `localhost` | Pre-filled broker hostname in the connection form |

Create a `.env` file at the project root if you need to override the default:

```env
VITE_DEFAULT_HOST=my-broker.example.com
```

### 5. Ports (development stack)

| Service | Port | Purpose |
|---|---|---|
| RabbitDigger (Vite) | 5173 | Dev server |
| RabbitMQ Management API | 15672 | REST endpoints |
| RabbitMQ AMQP | 5672 | Message broker |
| RabbitMQ WebStomp | 15674 | WebSocket/STOMP |

---

## Development environment setup

### Prerequisites

Only **Docker** and **Docker Compose v2** are required on the host. Node, Yarn, and all project dependencies are installed inside the container — you do not need them locally.

### First run

```bash
git clone <repo-url>
cd rabbitdigger
docker compose up -d
```

On first run, Docker builds the `app` image and starts:
- `app` — Vite dev server on http://localhost:5173 (already running, no manual start needed)
- `rabbitmq` — RabbitMQ with Management UI on http://localhost:15672

Wait ~30 seconds, then open http://localhost:5173.

### Useful URLs

| Service | URL | Credentials |
|---|---|---|
| RabbitDigger | http://localhost:5173 | — |
| RabbitMQ Management UI | http://localhost:15672 | guest / guest |

### Recommended shell alias

```bash
alias drd='docker compose exec app'
```

With this alias, all project commands become:

```bash
drd yarn install    # refresh deps after pulling
drd yarn build      # type-check + Vite build
drd yarn lint       # lint and auto-fix
drd yarn test:run   # run tests once
drd yarn test       # run tests in watch mode
```

If the `app` container is not running, use the slower one-shot fallback:

```bash
docker compose run --rm app yarn <cmd>
```

### Default queue

A durable `default` queue (vhost `/`) is pre-created on first startup via RabbitMQ Definitions ([`docker/rabbitmq/definitions.json`](docker/rabbitmq/definitions.json)). Definitions are loaded only on a fresh volume; to reinitialise:

```bash
docker compose down -v && docker compose up -d
```

---

## Running tests

All commands run inside the container (see alias above).

```bash
# Single run — fast, used in CI
drd yarn test:run

# Watch mode — for active development
drd yarn test

# Coverage report (v8)
drd yarn test:coverage
```

**Acceptance bar:** `yarn test:run` must be green before any commit.

Tests are co-located with their source files (`Foo.ts` ↔ `Foo.test.ts`). See [`AGENTS.md`](AGENTS.md) for full testing conventions and the Definition of Done.
