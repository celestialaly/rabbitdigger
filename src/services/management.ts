import { useConnectionStore } from '@/stores/connection'

function getBaseUrl(): string {
  return '/api'
}

function getHeaders(): HeadersInit {
  const store = useConnectionStore()
  const credentials = btoa(`${store.username}:${store.password}`)
  return {
    'Authorization': `Basic ${credentials}`,
    'Content-Type': 'application/json',
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    ...options,
    headers: { ...getHeaders(), ...(options.headers ?? {}) },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
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
    headers: Record<string, string> = {},
    vhost = '%2F',
  ) =>
    request<{ routed: boolean }>(`/api/exchanges/${vhost}/${encodeURIComponent(exchange)}/publish`, {
      method: 'POST',
      body: JSON.stringify({
        properties: { headers, delivery_mode: 2 },
        routing_key: routingKey,
        payload,
        payload_encoding: 'string',
      }),
    }),

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
}
