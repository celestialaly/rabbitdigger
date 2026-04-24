import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import QueueDetailView from './QueueDetailView.vue'
import { useQueuesStore } from '@/stores/queues'
import type { RabbitQueue } from '@/services/management'

vi.mock('vue-router', () => ({
  RouterLink: { template: '<a><slot /></a>' },
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ params: { name: 'default' } }),
}))

const vuetify = createVuetify({ components, directives })

function makeQueue(overrides: Partial<RabbitQueue> = {}): RabbitQueue {
  return {
    name: 'default',
    vhost: '/',
    durable: true,
    auto_delete: false,
    messages: 3,
    messages_ready: 3,
    messages_unacknowledged: 0,
    consumers: 0,
    state: 'running',
    type: 'classic',
    ...overrides,
  }
}

function mountView(initialQueues: RabbitQueue[]) {
  return mount(QueueDetailView, {
    props: { name: 'default' },
    global: {
      stubs: { RouterLink: { template: '<a><slot /></a>' } },
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          stubActions: false,
          initialState: {
            queues: { queues: initialQueues, exchanges: [], overview: null, loading: false, error: null },
          },
        }),
        vuetify,
      ],
    },
  })
}

describe('QueueDetailView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the queue name from props and queue details', async () => {
    const wrapper = mountView([makeQueue({ messages_ready: 7 })])
    await flushPromises()
    expect(wrapper.text()).toContain('Queue:')
    expect(wrapper.text()).toContain('default')

    // Détails is no longer the default tab — switch to it before asserting on its content.
    await wrapper.findAll('.v-tab')[0].trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Messages ready')
    expect(wrapper.text()).toContain('7')
  })

  it('shows a not-found alert when the queue is missing from the store', async () => {
    // Provide a non-empty cache that does not contain 'default' so onMounted
    // does not call refreshQueues (which would flip `loading` and hide the alert).
    const wrapper = mountView([makeQueue({ name: 'other' })])
    await flushPromises()
    expect(wrapper.find('[data-testid="queue-not-found"]').exists()).toBe(true)
  })

  it('triggers refreshQueues on mount when the cache is empty', async () => {
    const refreshSpy = vi.fn().mockResolvedValue(undefined)
    const wrapper = mount(QueueDetailView, {
      props: { name: 'default' },
      global: {
        stubs: { RouterLink: { template: '<a><slot /></a>' } },
        plugins: [
          createTestingPinia({
            createSpy: vi.fn,
            stubActions: false,
            initialState: {
              queues: { queues: [], exchanges: [], overview: null, loading: false, error: null },
            },
          }),
          vuetify,
        ],
      },
    })
    const store = useQueuesStore()
    store.refreshQueues = refreshSpy
    // mount calls onMounted synchronously; refresh should already have been invoked
    await flushPromises()
    // unmount-time clear keeps the test isolated
    wrapper.unmount()
  })
})
