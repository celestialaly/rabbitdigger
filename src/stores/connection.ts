import { defineStore } from 'pinia'
import { ref } from 'vue'
import { management } from '@/services/management'
import { connectStomp, disconnectStomp, stompStatus, stompError } from '@/services/stomp'

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

/**
 * Inactivity window after which the session is considered expired and the
 * user is forced back to the connection screen. Also gates the auto-redirect
 * to the last visited route after a manual reconnect.
 */
export const INACTIVITY_MS = 5 * 60 * 1000

export const SESSION_STORAGE_KEY = 'rabbitdigger:session'

/**
 * Subset of the connection state persisted in localStorage. The password is
 * intentionally excluded — see ADR 0009.
 */
interface PersistedSession {
  host: string
  managementPort: number
  stompPort: number
  username: string
  vhost: string
  lastActivity: number
  lastRoute: string | null
}

function readPersisted(): PersistedSession | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PersistedSession>
    if (
      typeof parsed.host !== 'string' ||
      typeof parsed.managementPort !== 'number' ||
      typeof parsed.stompPort !== 'number' ||
      typeof parsed.username !== 'string' ||
      typeof parsed.vhost !== 'string' ||
      typeof parsed.lastActivity !== 'number'
    ) {
      return null
    }
    return {
      host: parsed.host,
      managementPort: parsed.managementPort,
      stompPort: parsed.stompPort,
      username: parsed.username,
      vhost: parsed.vhost,
      lastActivity: parsed.lastActivity,
      lastRoute: typeof parsed.lastRoute === 'string' ? parsed.lastRoute : null,
    }
  } catch {
    return null
  }
}

function writePersisted(session: PersistedSession): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
  } catch {
    // Storage may be full or disabled — ignore, persistence is best-effort.
  }
}

function clearPersisted(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY)
  } catch {
    // ignore
  }
}

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

  /** Timestamp (ms) of the last user activity. Updated by `touch()`. */
  const lastActivity = ref(0)
  /** Last fully-qualified route visited while connected (for post-login redirect). */
  const lastRoute = ref<string | null>(null)

  function snapshot(): PersistedSession {
    return {
      host: host.value,
      managementPort: managementPort.value,
      stompPort: stompPort.value,
      username: username.value,
      vhost: vhost.value,
      lastActivity: lastActivity.value,
      lastRoute: lastRoute.value,
    }
  }

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
    lastActivity.value = Date.now()
    writePersisted(snapshot())
  }

  function disconnect() {
    disconnectStomp()
    status.value = 'disconnected'
    stompEnabled.value = false
    // The password is the only credential we ever held in memory but never
    // wrote to storage. Clear it on disconnect so the connection form forces
    // a fresh entry — see ADR 0009.
    password.value = ''
    clearPersisted()
  }

  /** Update the last-activity timestamp and refresh persisted storage. */
  function touch() {
    lastActivity.value = Date.now()
    if (status.value === 'connected') {
      writePersisted(snapshot())
    }
  }

  /** Remember the route the user is currently on so we can restore it after reconnect. */
  function rememberRoute(fullPath: string) {
    lastRoute.value = fullPath
    if (status.value === 'connected') {
      writePersisted(snapshot())
    }
  }

  /**
   * Hydrate refs from localStorage when the app boots. Never auto-connects —
   * the password is not persisted, so the user has to re-enter it manually.
   * Returns true when a session was restored, false otherwise.
   */
  function hydrateFromStorage(): boolean {
    const persisted = readPersisted()
    if (!persisted) return false
    host.value = persisted.host
    managementPort.value = persisted.managementPort
    stompPort.value = persisted.stompPort
    username.value = persisted.username
    vhost.value = persisted.vhost
    lastActivity.value = persisted.lastActivity
    lastRoute.value = persisted.lastRoute
    return true
  }

  return {
    host, managementPort, stompPort, username, password, vhost,
    status, error, stompEnabled, stompStatus, stompError,
    lastActivity, lastRoute,
    connect, disconnect, touch, rememberRoute, hydrateFromStorage,
  }
})
