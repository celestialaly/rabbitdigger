import { onUnmounted } from 'vue'

/**
 * Events that count as user activity. `mousemove` is the noisiest by far, so
 * it is throttled separately below — the others fire infrequently enough to
 * be handled directly.
 */
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'] as const

const MOUSEMOVE_THROTTLE_MS = 5_000

export interface InactivityTimeoutHandle {
  /** Begin listening for activity and arm the expiration timer. Idempotent. */
  start(): void
  /** Stop listening, clear the timer, and release all resources. Idempotent. */
  stop(): void
  /** Manually reset the expiration timer (e.g. after a successful API call). */
  reset(): void
}

/**
 * Calls `onExpire` after `timeoutMs` of no detected user activity. When
 * `onActivity` is provided, it is invoked on every (throttled) activity event
 * — typically wired to `connectionStore.touch()` so the persisted
 * `lastActivity` stays fresh.
 *
 * Listeners are registered on `window` (passive, capture). The composable
 * cleans up automatically on `onUnmounted`, but `stop()` is exposed for
 * conditional teardown (e.g. when the user disconnects).
 */
export function useInactivityTimeout(
  timeoutMs: number,
  onExpire: () => void,
  onActivity?: () => void,
): InactivityTimeoutHandle {
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastMousemoveAt = 0
  let running = false

  function reset() {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      stop()
      onExpire()
    }, timeoutMs)
  }

  function handleEvent(event: Event) {
    if (event.type === 'mousemove') {
      const now = Date.now()
      if (now - lastMousemoveAt < MOUSEMOVE_THROTTLE_MS) return
      lastMousemoveAt = now
    }
    onActivity?.()
    reset()
  }

  function start() {
    if (running) return
    running = true
    for (const name of ACTIVITY_EVENTS) {
      window.addEventListener(name, handleEvent, { passive: true, capture: true })
    }
    reset()
  }

  function stop() {
    if (!running) return
    running = false
    for (const name of ACTIVITY_EVENTS) {
      window.removeEventListener(name, handleEvent, { capture: true } as EventListenerOptions)
    }
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  onUnmounted(stop)

  return { start, stop, reset }
}
