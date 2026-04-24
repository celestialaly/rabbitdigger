import { Client, type IMessage, type StompSubscription } from '@stomp/stompjs'
import { ref } from 'vue'

export type StompStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

const client = ref<Client | null>(null)
export const stompStatus = ref<StompStatus>('disconnected')
export const stompError = ref<string | null>(null)

export function connectStomp(
  host: string,
  port: number,
  username: string,
  password: string,
  vhost = '/',
): Promise<void> {
  return new Promise((resolve, reject) => {
    stompStatus.value = 'connecting'
    stompError.value = null

    const brokerURL = `ws://${host}:${port}/ws`

    const c = new Client({
      brokerURL,
      connectHeaders: { login: username, passcode: password, host: vhost },
      reconnectDelay: 5000,
      onConnect: () => {
        stompStatus.value = 'connected'
        resolve()
      },
      onStompError: (frame) => {
        stompError.value = frame.headers['message'] ?? 'STOMP error'
        stompStatus.value = 'error'
        reject(new Error(stompError.value ?? undefined))
      },
      onWebSocketError: (evt) => {
        stompError.value = 'WebSocket connection failed'
        stompStatus.value = 'error'
        reject(new Error(stompError.value ?? undefined))
      },
      onDisconnect: () => {
        stompStatus.value = 'disconnected'
      },
    })

    c.activate()
    client.value = c
  })
}

export function disconnectStomp(): void {
  client.value?.deactivate()
  client.value = null
  stompStatus.value = 'disconnected'
}

export function subscribe(
  queue: string,
  onMessage: (msg: IMessage) => void,
): StompSubscription | null {
  if (!client.value || stompStatus.value !== 'connected') return null
  return client.value.subscribe(`/queue/${queue}`, onMessage)
}

export function publish(
  destination: string,
  body: string,
  headers: Record<string, string> = {},
): void {
  if (!client.value || stompStatus.value !== 'connected') {
    throw new Error('STOMP not connected')
  }
  client.value.publish({ destination: `/exchange/${destination}`, body, headers })
}
