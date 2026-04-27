import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useConnectionStore } from '@/stores/connection'
import { management } from './management'

describe('management service', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    setActivePinia(createPinia())
    const store = useConnectionStore()
    store.host = 'localhost'
    store.managementPort = 15672
    store.username = 'guest'
    store.password = 'guest'
    fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends Basic Auth header derived from store credentials', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ name: 'guest', tags: '' }) })
    await management.whoami()
    const [, init] = fetchMock.mock.calls[0]
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe(`Basic ${btoa('guest:guest')}`)
    expect(headers['Content-Type']).toBe('application/json')
  })

  it('routes through the /__rabbit proxy and forwards the broker URL via X-Rabbit-Target', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    await management.whoami()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/__rabbit/api/whoami')
    const headers = init.headers as Record<string, string>
    expect(headers['X-Rabbit-Target']).toBe('http://localhost:15672')
  })

  it('honours a custom host / managementPort from the store via X-Rabbit-Target', async () => {
    const store = useConnectionStore()
    store.host = 'broker.example.com'
    store.managementPort = 25672
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    await management.whoami()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/__rabbit/api/whoami')
    expect((init.headers as Record<string, string>)['X-Rabbit-Target']).toBe(
      'http://broker.example.com:25672',
    )
  })

  it('throws on non-OK response with status and body', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'unauthorized' })
    await expect(management.whoami()).rejects.toThrow(/HTTP 401: unauthorized/)
  })

  describe('getQueueMessages', () => {
    it('POSTs to /api/queues/{vhost}/{name}/get with default options', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] })
      await management.getQueueMessages('default')

      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe('/__rabbit/api/queues/%2F/default/get')
      expect(init.method).toBe('POST')
      expect(JSON.parse(init.body as string)).toEqual({
        count: 50,
        ackmode: 'ack_requeue_true',
        encoding: 'auto',
        truncate: 50_000,
      })
    })

    it('honours custom count, ackmode, truncate and vhost', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] })
      await management.getQueueMessages('orders', {
        count: 10,
        ackmode: 'ack_requeue_false',
        truncate: 1024,
        vhost: 'prod',
      })

      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe('/__rabbit/api/queues/prod/orders/get')
      expect(JSON.parse(init.body as string)).toEqual({
        count: 10,
        ackmode: 'ack_requeue_false',
        encoding: 'auto',
        truncate: 1024,
      })
    })

    it('URL-encodes the queue name', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] })
      await management.getQueueMessages('my queue/with-slash')
      expect(fetchMock.mock.calls[0][0]).toBe(
        '/__rabbit/api/queues/%2F/my%20queue%2Fwith-slash/get',
      )
    })
  })

  describe('createQueue', () => {
    it('PUTs to /api/queues/{vhost}/{name} with encoded vhost and name', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, text: async () => '' })
      await management.createQueue({
        name: 'orders',
        type: 'classic',
        durable: true,
        auto_delete: false,
      })

      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe('/__rabbit/api/queues/%2F/orders')
      expect(init.method).toBe('PUT')
      expect(JSON.parse(init.body as string)).toEqual({
        durable: true,
        auto_delete: false,
        arguments: { 'x-queue-type': 'classic' },
      })
    })

    it('encodes special characters in the queue name', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, text: async () => '' })
      await management.createQueue({
        name: 'my queue/slash',
        type: 'quorum',
        durable: true,
        auto_delete: false,
      })
      expect(fetchMock.mock.calls[0][0]).toBe(
        '/__rabbit/api/queues/%2F/my%20queue%2Fslash',
      )
    })

    it('forwards x-queue-type for quorum and stream', async () => {
      fetchMock.mockResolvedValue({ ok: true, text: async () => '' })

      await management.createQueue({ name: 'q1', type: 'quorum', durable: true, auto_delete: false })
      expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).arguments).toEqual({
        'x-queue-type': 'quorum',
      })

      await management.createQueue({ name: 'q2', type: 'stream', durable: true, auto_delete: false })
      expect(JSON.parse(fetchMock.mock.calls[1][1].body as string).arguments).toEqual({
        'x-queue-type': 'stream',
      })
    })

    it('uses the vhost from the connection store', async () => {
      const store = useConnectionStore()
      store.vhost = 'prod'
      fetchMock.mockResolvedValueOnce({ ok: true, text: async () => '' })
      await management.createQueue({
        name: 'orders',
        type: 'classic',
        durable: true,
        auto_delete: false,
      })
      expect(fetchMock.mock.calls[0][0]).toBe('/__rabbit/api/queues/prod/orders')
    })

    it('does not call res.json() (broker returns no body)', async () => {
      const json = vi.fn()
      fetchMock.mockResolvedValueOnce({ ok: true, json, text: async () => '' })
      await management.createQueue({
        name: 'orders',
        type: 'classic',
        durable: true,
        auto_delete: false,
      })
      expect(json).not.toHaveBeenCalled()
    })

    it('throws on non-OK with status and body', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 406,
        text: async () => 'PRECONDITION_FAILED - inequivalent arg',
      })
      await expect(
        management.createQueue({
          name: 'orders',
          type: 'classic',
          durable: false,
          auto_delete: false,
        }),
      ).rejects.toThrow(/HTTP 406: PRECONDITION_FAILED/)
    })
  })
})
