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

  async function connect() {
    status.value = 'connecting'
    error.value = null
    try {
      // Verify REST credentials
      await management.whoami()
      // Connect WebStomp
      await connectStomp(host.value, stompPort.value, username.value, password.value, vhost.value)
      status.value = 'connected'
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Connection failed'
      status.value = 'error'
    }
  }

  function disconnect() {
    disconnectStomp()
    status.value = 'disconnected'
  }

  return {
    host, managementPort, stompPort, username, password, vhost,
    status, error, stompStatus, stompError,
    connect, disconnect,
  }
})
