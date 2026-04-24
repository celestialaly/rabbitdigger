import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useConnectionStore } from '@/stores/connection'
import { management } from './management'

describe('management service', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    setActivePinia(createPinia())
    const store = useConnectionStore()
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

  it('prefixes URLs with /api', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    await management.whoami()
    expect(fetchMock.mock.calls[0][0]).toBe('/api/api/whoami')
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
      expect(url).toBe('/api/api/queues/%2F/default/get')
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
      expect(url).toBe('/api/api/queues/prod/orders/get')
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
        '/api/api/queues/%2F/my%20queue%2Fwith-slash/get',
      )
    })
  })
})
