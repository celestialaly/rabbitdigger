import { useConnectionStore } from '@/stores/connection'

/**
 * All REST calls go through the same-origin `/__rabbit` Vite middleware
 * (see `vite.config.ts` and ADR 0006). The actual broker URL is passed via
 * the `X-Rabbit-Target` header, so the browser never makes a cross-origin
 * request — CORS on the target broker becomes irrelevant.
 */
const PROXY_PREFIX = '/__rabbit'

function getTarget(): string {
  const store = useConnectionStore()
  return `http://${store.host}:${store.managementPort}`
}

function getHeaders(): HeadersInit {
  const store = useConnectionStore()
  const credentials = btoa(`${store.username}:${store.password}`)
  return {
    'Authorization': `Basic ${credentials}`,
    'Content-Type': 'application/json',
    'X-Rabbit-Target': getTarget(),
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${PROXY_PREFIX}${path}`, {
    ...options,
    headers: { ...getHeaders(), ...(options.headers ?? {}) },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

/**
 * Like `request`, but for endpoints that return no body (RabbitMQ uses
 * 201/204 without content for resource creation/deletion). We never call
 * `res.json()`, which would throw on an empty body.
 */
async function requestNoContent(path: string, options: RequestInit = {}): Promise<void> {
  const res = await fetch(`${PROXY_PREFIX}${path}`, {
    ...options,
    headers: { ...getHeaders(), ...(options.headers ?? {}) },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RabbitOverview {
  rabbitmq_version: string
  cluster_name: string
  message_stats?: {
    publish?: number
    publish_details?: { rate: number }
    deliver_get?: number
    deliver_get_details?: { rate: number }
  }
  queue_totals?: {
    messages: number
    messages_ready: number
    messages_unacknowledged: number
  }
  object_totals?: {
    consumers: number
    queues: number
    exchanges: number
    connections: number
    channels: number
  }
}

export interface RabbitQueue {
  name: string
  vhost: string
  durable: boolean
  auto_delete: boolean
  messages: number
  messages_ready: number
  messages_unacknowledged: number
  consumers: number
  state: string
  /** 'classic' | 'quorum' | 'stream' (RabbitMQ 3.8+) */
  type?: string
}

/**
 * One message returned by POST /api/queues/{vhost}/{name}/get.
 * `payload_encoding` is 'string' (UTF-8) or 'base64' (binary / non-UTF-8).
 */
export interface PeekedMessage {
  payload: string
  payload_bytes: number
  payload_encoding: 'string' | 'base64'
  redelivered: boolean
  exchange: string
  routing_key: string
  message_count: number
  properties: {
    headers?: Record<string, unknown>
    delivery_mode?: number
    content_type?: string
    content_encoding?: string
    correlation_id?: string
    reply_to?: string
    expiration?: string
    message_id?: string
    timestamp?: number
    type?: string
    user_id?: string
    app_id?: string
    [key: string]: unknown
  }
}

export type GetMessagesAckMode =
  | 'ack_requeue_true'
  | 'ack_requeue_false'
  | 'reject_requeue_true'
  | 'reject_requeue_false'

export interface GetMessagesOptions {
  count?: number
  /** Defaults to 'ack_requeue_true' (non-destructive). */
  ackmode?: GetMessagesAckMode
  /** Max payload bytes returned per message (server truncates above). */
  truncate?: number
  vhost?: string
}

export const DEFAULT_GET_TRUNCATE = 50_000

/**
 * Options for `management.publishMessage`.
 *
 * - `headers` is folded into `properties.headers` for callers that only need
 *   simple header metadata (used by `PublishView`).
 * - `properties` is merged on top of the defaults (`delivery_mode: 2`,
 *   `headers`) so callers can override or supplement specific fields such as
 *   `message_id` (used by the CSV import flow, ADR 0011).
 * - `payloadEncoding` mirrors RabbitMQ's `payload_encoding`: `'string'` for
 *   UTF-8 text or `'base64'` for binary content.
 */
export interface PublishMessageOptions {
  headers?: Record<string, string>
  properties?: PeekedMessage['properties']
  payloadEncoding?: 'string' | 'base64'
  vhost?: string
}

export interface RabbitExchange {
  name: string
  vhost: string
  type: string
  durable: boolean
  auto_delete: boolean
  internal: boolean
}

export interface RabbitBinding {
  source: string
  vhost: string
  destination: string
  destination_type: string
  routing_key: string
}

/** Supported queue types when creating a queue (RabbitMQ 3.8+). */
export type QueueType = 'classic' | 'quorum' | 'stream'

/** Caller-facing payload to create a queue. Mapped to the broker body in `createQueue`. */
export interface CreateQueueInput {
  name: string
  type: QueueType
  durable: boolean
  auto_delete: boolean
}

// ── API calls ─────────────────────────────────────────────────────────────────

export const management = {
  getOverview: () => request<RabbitOverview>('/api/overview'),

  getQueues: (vhost = '%2F') =>
    request<RabbitQueue[]>(`/api/queues/${vhost}`),

  getExchanges: (vhost = '%2F') =>
    request<RabbitExchange[]>(`/api/exchanges/${vhost}`),

  getBindings: (vhost = '%2F') =>
    request<RabbitBinding[]>(`/api/bindings/${vhost}`),

  publishMessage: (
    exchange: string,
    routingKey: string,
    payload: string,
    opts: PublishMessageOptions = {},
  ) => {
    const { headers, properties, payloadEncoding = 'string', vhost = '%2F' } = opts
    const mergedProperties = {
      delivery_mode: 2,
      headers: headers ?? {},
      ...(properties ?? {}),
    }
    return request<{ routed: boolean }>(
      `/api/exchanges/${vhost}/${encodeURIComponent(exchange)}/publish`,
      {
        method: 'POST',
        body: JSON.stringify({
          properties: mergedProperties,
          routing_key: routingKey,
          payload,
          payload_encoding: payloadEncoding,
        }),
      },
    )
  },

  /**
   * Read messages from a queue without (by default) consuming them.
   *
   * RabbitMQ's `/get` endpoint is a POST. With `ackmode: 'ack_requeue_true'`
   * (the default here) every message read is re-injected into the queue, but
   * its position changes and `redelivered` becomes true.
   */
  getQueueMessages: (
    queue: string,
    {
      count = 50,
      ackmode = 'ack_requeue_true',
      truncate = DEFAULT_GET_TRUNCATE,
      vhost = '%2F',
    }: GetMessagesOptions = {},
  ) =>
    request<PeekedMessage[]>(
      `/api/queues/${vhost}/${encodeURIComponent(queue)}/get`,
      {
        method: 'POST',
        body: JSON.stringify({
          count,
          ackmode,
          encoding: 'auto',
          truncate,
        }),
      },
    ),

  /** Verify credentials by calling /api/whoami */
  whoami: () => request<{ name: string; tags: string }>('/api/whoami'),

  /**
   * Create (or idempotently update) a queue via PUT /api/queues/{vhost}/{name}.
   * The vhost is read from the connection store and URL-encoded. The queue
   * type is sent through `arguments['x-queue-type']` (RabbitMQ 3.8+).
   */
  createQueue: (input: CreateQueueInput) => {
    const store = useConnectionStore()
    const vhost = encodeURIComponent(store.vhost)
    const name = encodeURIComponent(input.name)
    return requestNoContent(`/api/queues/${vhost}/${name}`, {
      method: 'PUT',
      body: JSON.stringify({
        durable: input.durable,
        auto_delete: input.auto_delete,
        arguments: { 'x-queue-type': input.type },
      }),
    })
  },
}
