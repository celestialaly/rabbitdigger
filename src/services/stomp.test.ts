import { describe, it, expect, beforeEach, vi } from 'vitest'

type ClientCtorArgs = {
  brokerURL: string
  connectHeaders: { login: string; passcode: string; host: string }
  reconnectDelay: number
  onConnect: () => void
  onStompError: (frame: { headers: Record<string, string> }) => void
  onWebSocketError: (evt: Event) => void
  onDisconnect: () => void
}

const lastClient = { args: null as ClientCtorArgs | null, activated: false, deactivated: false }

vi.mock('@stomp/stompjs', () => {
  class Client {
    activate: () => void
    deactivate: () => void
    subscribe = vi.fn()
    publish = vi.fn()
    constructor(args: ClientCtorArgs) {
      lastClient.args = args
      this.activate = () => {
        lastClient.activated = true
      }
      this.deactivate = () => {
        lastClient.deactivated = true
      }
    }
  }
  return { Client }
})

import {
  connectStomp,
  disconnectStomp,
  stompStatus,
  stompError,
} from './stomp'

describe('stomp service', () => {
  beforeEach(() => {
    lastClient.args = null
    lastClient.activated = false
    lastClient.deactivated = false
    stompStatus.value = 'disconnected'
    stompError.value = null
  })

  it('builds the correct brokerURL and connect headers', () => {
    void connectStomp('myhost', 15674, 'guest', 'guest', '/')
    expect(lastClient.args?.brokerURL).toBe('ws://myhost:15674/ws')
    expect(lastClient.args?.connectHeaders).toEqual({
      login: 'guest',
      passcode: 'guest',
      host: '/',
    })
    expect(lastClient.activated).toBe(true)
    expect(stompStatus.value).toBe('connecting')
  })

  it('resolves and sets status=connected on onConnect', async () => {
    const p = connectStomp('h', 1, 'u', 'p')
    lastClient.args!.onConnect()
    await expect(p).resolves.toBeUndefined()
    expect(stompStatus.value).toBe('connected')
  })

  it('rejects with "WebSocket connection failed" on onWebSocketError', async () => {
    const p = connectStomp('h', 1, 'u', 'p')
    lastClient.args!.onWebSocketError(new Event('error'))
    await expect(p).rejects.toThrow('WebSocket connection failed')
    expect(stompStatus.value).toBe('error')
    expect(stompError.value).toBe('WebSocket connection failed')
  })

  it('rejects with STOMP frame message on onStompError', async () => {
    const p = connectStomp('h', 1, 'u', 'p')
    lastClient.args!.onStompError({ headers: { message: 'auth failed' } })
    await expect(p).rejects.toThrow('auth failed')
    expect(stompStatus.value).toBe('error')
  })

  it('disconnect deactivates and resets status', async () => {
    const p = connectStomp('h', 1, 'u', 'p')
    lastClient.args!.onConnect()
    await p
    disconnectStomp()
    expect(lastClient.deactivated).toBe(true)
    expect(stompStatus.value).toBe('disconnected')
  })
})
