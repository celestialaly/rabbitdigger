import { vi } from 'vitest'

// Vuetify uses ResizeObserver and matchMedia which happy-dom doesn't fully implement.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver =
    ResizeObserverStub
}

if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

// CSS.supports stub used by Vuetify
if (typeof CSS === 'undefined' || !CSS.supports) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).CSS = { supports: () => false, escape: (s: string) => s }
}

// visualViewport is used by Vuetify VOverlay's location strategy and is not
// implemented by happy-dom.
if (typeof window !== 'undefined' && !window.visualViewport) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window as any).visualViewport = {
    width: 1024,
    height: 768,
    offsetLeft: 0,
    offsetTop: 0,
    pageLeft: 0,
    pageTop: 0,
    scale: 1,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }
}
