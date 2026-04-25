import { defineStore } from 'pinia'
import { ref } from 'vue'
import { management } from '@/services/management'
import { connectStomp, disconnectStomp, stompStatus, stompError } from '@/services/stomp'

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export const useConnectionStore = defineStore('connection', () => {
  const host = ref(import.meta.env.VITE_DEFAULT_HOST ?? 'localhost')
  const managementPort = ref(15672)
  const stompPort = ref(15674)
  const username = ref('guest')
  const password = ref('guest')
  const vhost = ref('/')
  const status = ref<ConnectionStatus>('disconnected')
  const error = ref<string | null>(null)
  /**
   * True when the broker reports a STOMP listener (WebStomp plugin enabled).
   * When false, REST-only features stay available but real-time consumption is disabled.
   */
  const stompEnabled = ref(false)

  async function connect() {
    status.value = 'connecting'
    error.value = null
    stompEnabled.value = false
    try {
      // Verify REST credentials — REST is required, the rest is optional
      await management.whoami()
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Connection failed'
      status.value = 'error'
      return
    }

    // Try to open the STOMP WebSocket. Failure here is non-fatal: the WebStomp
    // plugin may simply be disabled on the broker, the port may be firewalled,
    // or a reverse proxy may not forward WebSocket upgrades. In all those cases
    // we still want REST-only features (queues, messages, exchanges, publish)
    // to work, so we degrade gracefully.
    try {
      await connectStomp(host.value, stompPort.value, username.value, password.value, vhost.value)
      stompEnabled.value = true
    } catch (e) {
      console.warn(
        '[rabbitdigger] STOMP WebSocket unavailable — real-time consumption disabled.',
        e,
      )
      // Clean up the half-initialised client so a later reconnect starts fresh.
      disconnectStomp()
      stompEnabled.value = false
    }

    status.value = 'connected'
  }

  function disconnect() {
    disconnectStomp()
    status.value = 'disconnected'
    stompEnabled.value = false
  }

  return {
    host, managementPort, stompPort, username, password, vhost,
    status, error, stompEnabled, stompStatus, stompError,
    connect, disconnect,
  }
})
