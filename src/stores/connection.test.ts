import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/services/management', () => ({
  management: { whoami: vi.fn() },
}))

vi.mock('@/services/stomp', () => ({
  connectStomp: vi.fn(),
  disconnectStomp: vi.fn(),
  stompStatus: { value: 'disconnected' },
  stompError: { value: null },
}))

import { useConnectionStore } from './connection'
import { management } from '@/services/management'
import { connectStomp, disconnectStomp } from '@/services/stomp'
import { SESSION_STORAGE_KEY } from './connection'

describe('connection store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('defaults host to "localhost" when VITE_DEFAULT_HOST is not set', () => {
    const store = useConnectionStore()
    expect(store.host).toBe('localhost')
  })

  it('uses VITE_DEFAULT_HOST as default host when set', () => {
    vi.stubEnv('VITE_DEFAULT_HOST', 'myrabbit.example.com')
    const store = useConnectionStore()
    expect(store.host).toBe('myrabbit.example.com')
    vi.unstubAllEnvs()
  })

  it('transitions connecting → connected on success', async () => {
    vi.mocked(management.whoami).mockResolvedValueOnce({ name: 'guest', tags: '' })
    vi.mocked(connectStomp).mockResolvedValueOnce(undefined)

    const store = useConnectionStore()
    const promise = store.connect()
    expect(store.status).toBe('connecting')
    await promise
    expect(store.status).toBe('connected')
    expect(store.error).toBeNull()
    expect(store.stompEnabled).toBe(true)
    expect(connectStomp).toHaveBeenCalledOnce()
  })

  it('still reports connected with stompEnabled=false when the WebSocket handshake fails', async () => {
    vi.mocked(management.whoami).mockResolvedValueOnce({ name: 'guest', tags: '' })
    vi.mocked(connectStomp).mockRejectedValueOnce(new Error('WebSocket connection failed'))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const store = useConnectionStore()
    await store.connect()

    expect(store.status).toBe('connected')
    expect(store.error).toBeNull()
    expect(store.stompEnabled).toBe(false)
    expect(disconnectStomp).toHaveBeenCalledOnce()
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('transitions to error and stores message when whoami fails', async () => {
    vi.mocked(management.whoami).mockRejectedValueOnce(new Error('HTTP 401: unauthorized'))

    const store = useConnectionStore()
    await store.connect()
    expect(store.status).toBe('error')
    expect(store.error).toBe('HTTP 401: unauthorized')
    expect(store.stompEnabled).toBe(false)
    expect(connectStomp).not.toHaveBeenCalled()
  })

  it('disconnect calls disconnectStomp and resets status', () => {
    const store = useConnectionStore()
    store.disconnect()
    expect(disconnectStomp).toHaveBeenCalledOnce()
    expect(store.status).toBe('disconnected')
    expect(store.stompEnabled).toBe(false)
  })

  describe('persistence', () => {
    it('persists session (without password) on successful connect', async () => {
      vi.mocked(management.whoami).mockResolvedValueOnce({ name: 'guest', tags: '' })
      vi.mocked(connectStomp).mockResolvedValueOnce(undefined)

      const store = useConnectionStore()
      store.host = 'broker.example.com'
      store.username = 'alice'
      store.password = 'secret-pw'
      await store.connect()

      const raw = localStorage.getItem(SESSION_STORAGE_KEY)
      expect(raw).not.toBeNull()
      const parsed = JSON.parse(raw!)
      expect(parsed.host).toBe('broker.example.com')
      expect(parsed.username).toBe('alice')
      expect(parsed.managementPort).toBe(15672)
      expect(parsed.stompPort).toBe(15674)
      expect(parsed.vhost).toBe('/')
      expect(parsed.lastActivity).toEqual(expect.any(Number))
      // The password must NEVER be persisted — see ADR 0009.
      expect(parsed).not.toHaveProperty('password')
      expect(raw).not.toContain('secret-pw')
    })

    it('hydrateFromStorage restores broker settings without auto-connecting', () => {
      localStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({
          host: 'broker.example.com',
          managementPort: 25672,
          stompPort: 25674,
          username: 'alice',
          vhost: '/test',
          lastActivity: Date.now(),
          lastRoute: '/queues/foo',
        }),
      )

      const store = useConnectionStore()
      const restored = store.hydrateFromStorage()

      expect(restored).toBe(true)
      expect(store.host).toBe('broker.example.com')
      expect(store.managementPort).toBe(25672)
      expect(store.stompPort).toBe(25674)
      expect(store.username).toBe('alice')
      expect(store.vhost).toBe('/test')
      expect(store.lastRoute).toBe('/queues/foo')
      // No connect attempt: status must stay disconnected.
      expect(store.status).toBe('disconnected')
      expect(management.whoami).not.toHaveBeenCalled()
      expect(connectStomp).not.toHaveBeenCalled()
    })

    it('hydrateFromStorage returns false when storage is empty', () => {
      const store = useConnectionStore()
      expect(store.hydrateFromStorage()).toBe(false)
    })

    it('hydrateFromStorage returns false on malformed payload', () => {
      localStorage.setItem(SESSION_STORAGE_KEY, '{not-json')
      const store = useConnectionStore()
      expect(store.hydrateFromStorage()).toBe(false)
    })

    it('disconnect clears persisted session and wipes the in-memory password', () => {
      localStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({
          host: 'broker.example.com',
          managementPort: 15672,
          stompPort: 15674,
          username: 'alice',
          vhost: '/',
          lastActivity: Date.now(),
          lastRoute: '/queues',
        }),
      )

      const store = useConnectionStore()
      store.password = 'secret'
      store.disconnect()

      expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull()
      expect(store.password).toBe('')
    })

    it('touch refreshes lastActivity and persists when connected', async () => {
      vi.mocked(management.whoami).mockResolvedValueOnce({ name: 'guest', tags: '' })
      vi.mocked(connectStomp).mockResolvedValueOnce(undefined)

      const store = useConnectionStore()
      await store.connect()
      const initial = store.lastActivity
      // Ensure clock advances at least 1 ms so the assertion is meaningful.
      await new Promise((r) => setTimeout(r, 2))
      store.touch()
      expect(store.lastActivity).toBeGreaterThan(initial)
      const parsed = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY)!)
      expect(parsed.lastActivity).toBe(store.lastActivity)
    })

    it('touch does not write to storage when disconnected', () => {
      const store = useConnectionStore()
      store.touch()
      expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull()
    })

    it('rememberRoute updates lastRoute and persists when connected', async () => {
      vi.mocked(management.whoami).mockResolvedValueOnce({ name: 'guest', tags: '' })
      vi.mocked(connectStomp).mockResolvedValueOnce(undefined)

      const store = useConnectionStore()
      await store.connect()
      store.rememberRoute('/queues/foo')
      expect(store.lastRoute).toBe('/queues/foo')
      const parsed = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY)!)
      expect(parsed.lastRoute).toBe('/queues/foo')
    })
  })
})
