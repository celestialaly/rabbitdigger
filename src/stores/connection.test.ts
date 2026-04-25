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

describe('connection store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
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
})
