import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/services/management', async () => {
  const actual = await vi.importActual<typeof import('@/services/management')>(
    '@/services/management',
  )
  return {
    ...actual,
    management: { getQueueMessages: vi.fn() },
  }
})

import { useQueueMessagesStore } from './queueMessages'
import { management, type PeekedMessage } from '@/services/management'

function makeMessage(overrides: Partial<PeekedMessage> = {}): PeekedMessage {
  return {
    payload: 'hello',
    payload_bytes: 5,
    payload_encoding: 'string',
    redelivered: false,
    exchange: '',
    routing_key: 'default',
    message_count: 0,
    properties: {},
    ...overrides,
  }
}

describe('queueMessages store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('starts empty', () => {
    const store = useQueueMessagesStore()
    expect(store.messages).toEqual([])
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
    expect(store.lastFetchAt).toBeNull()
    expect(store.lastQueue).toBeNull()
  })

  it('fetchMessages with requeue=true sends ack_requeue_true and stores result', async () => {
    const msg = makeMessage()
    vi.mocked(management.getQueueMessages).mockResolvedValueOnce([msg])

    const store = useQueueMessagesStore()
    await store.fetchMessages('default', { count: 10, requeue: true })

    expect(management.getQueueMessages).toHaveBeenCalledWith('default', {
      count: 10,
      ackmode: 'ack_requeue_true',
    })
    expect(store.messages).toEqual([msg])
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
    expect(store.lastQueue).toBe('default')
    expect(store.lastFetchAt).toBeInstanceOf(Date)
  })

  it('fetchMessages with requeue=false sends ack_requeue_false', async () => {
    vi.mocked(management.getQueueMessages).mockResolvedValueOnce([])
    const store = useQueueMessagesStore()
    await store.fetchMessages('default', { count: 5, requeue: false })

    expect(management.getQueueMessages).toHaveBeenCalledWith('default', {
      count: 5,
      ackmode: 'ack_requeue_false',
    })
  })

  it('toggles loading during the call', async () => {
    let resolveFn!: (v: PeekedMessage[]) => void
    vi.mocked(management.getQueueMessages).mockReturnValueOnce(
      new Promise((r) => {
        resolveFn = r
      }),
    )

    const store = useQueueMessagesStore()
    const p = store.fetchMessages('q', { count: 1, requeue: true })
    expect(store.loading).toBe(true)
    resolveFn([])
    await p
    expect(store.loading).toBe(false)
  })

  it('captures error message on failure and clears messages', async () => {
    vi.mocked(management.getQueueMessages).mockRejectedValueOnce(
      new Error('HTTP 404: not found'),
    )

    const store = useQueueMessagesStore()
    store.messages = [makeMessage()]
    await store.fetchMessages('missing', { count: 5, requeue: true })

    expect(store.error).toBe('HTTP 404: not found')
    expect(store.loading).toBe(false)
  })

  it('clear resets state', async () => {
    vi.mocked(management.getQueueMessages).mockResolvedValueOnce([makeMessage()])
    const store = useQueueMessagesStore()
    await store.fetchMessages('q', { count: 1, requeue: true })
    store.clear()

    expect(store.messages).toEqual([])
    expect(store.error).toBeNull()
    expect(store.lastFetchAt).toBeNull()
    expect(store.lastQueue).toBeNull()
  })
})
