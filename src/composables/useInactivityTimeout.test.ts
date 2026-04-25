import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { useInactivityTimeout } from './useInactivityTimeout'

/**
 * Mount the composable inside a tiny host component so Vue lifecycle hooks
 * (onUnmounted) wire up correctly. See vue-testing-best-practices →
 * testing-composables-helper-wrapper.
 */
function withSetup<T>(setup: () => T): { result: T; unmount: () => void } {
  let result!: T
  const wrapper = mount(
    defineComponent({
      setup() {
        result = setup()
        return () => h('div')
      },
    }),
  )
  return { result, unmount: () => wrapper.unmount() }
}

describe('useInactivityTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls onExpire after the timeout when start() is invoked', () => {
    const onExpire = vi.fn()
    const { result, unmount } = withSetup(() => useInactivityTimeout(1000, onExpire))
    result.start()

    vi.advanceTimersByTime(999)
    expect(onExpire).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onExpire).toHaveBeenCalledOnce()
    unmount()
  })

  it('does not arm the timer until start() is called', () => {
    const onExpire = vi.fn()
    const { unmount } = withSetup(() => useInactivityTimeout(1000, onExpire))
    vi.advanceTimersByTime(5000)
    expect(onExpire).not.toHaveBeenCalled()
    unmount()
  })

  it('resets the timer when a user activity event fires', () => {
    const onExpire = vi.fn()
    const onActivity = vi.fn()
    const { result, unmount } = withSetup(() =>
      useInactivityTimeout(1000, onExpire, onActivity),
    )
    result.start()

    vi.advanceTimersByTime(800)
    window.dispatchEvent(new Event('keydown'))
    vi.advanceTimersByTime(800)
    expect(onExpire).not.toHaveBeenCalled()
    expect(onActivity).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(200)
    expect(onExpire).toHaveBeenCalledOnce()
    unmount()
  })

  it('throttles mousemove activity to once per 5s window', () => {
    const onExpire = vi.fn()
    const onActivity = vi.fn()
    const { result, unmount } = withSetup(() =>
      useInactivityTimeout(60_000, onExpire, onActivity),
    )
    result.start()

    window.dispatchEvent(new Event('mousemove'))
    window.dispatchEvent(new Event('mousemove'))
    window.dispatchEvent(new Event('mousemove'))
    expect(onActivity).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(5_000)
    window.dispatchEvent(new Event('mousemove'))
    expect(onActivity).toHaveBeenCalledTimes(2)
    unmount()
  })

  it('stop() removes listeners and disarms the timer', () => {
    const onExpire = vi.fn()
    const onActivity = vi.fn()
    const { result, unmount } = withSetup(() =>
      useInactivityTimeout(1000, onExpire, onActivity),
    )
    result.start()
    result.stop()

    window.dispatchEvent(new Event('keydown'))
    expect(onActivity).not.toHaveBeenCalled()
    vi.advanceTimersByTime(5000)
    expect(onExpire).not.toHaveBeenCalled()
    unmount()
  })

  it('cleans up automatically on unmount', () => {
    const onExpire = vi.fn()
    const { result, unmount } = withSetup(() => useInactivityTimeout(1000, onExpire))
    result.start()
    unmount()

    vi.advanceTimersByTime(5000)
    expect(onExpire).not.toHaveBeenCalled()
  })
})
