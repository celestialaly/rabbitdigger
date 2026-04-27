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
    // stubActions: true auto-creates vi.fn() spies for every action before mount,
    // which prevents the real refreshQueues() from firing a real fetch request.
    const wrapper = mount(QueueDetailView, {
      props: { name: 'default' },
      global: {
        stubs: { RouterLink: { template: '<a><slot /></a>' } },
        plugins: [
          createTestingPinia({
            createSpy: vi.fn,
            stubActions: true,
            initialState: {
              queues: { queues: [], exchanges: [], overview: null, loading: false, error: null },
            },
          }),
          vuetify,
        ],
      },
    })
    const store = useQueuesStore()
    await flushPromises()
    expect(store.refreshQueues).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  describe('Import tab', () => {
    it('exposes an Import tab next to Details and Messages', async () => {
      const wrapper = mountView([makeQueue()])
      await flushPromises()
      const tabLabels = wrapper.findAll('.v-tab').map((t) => t.text())
      expect(tabLabels).toEqual(['Details', 'Messages', 'Import'])
    })

    it('renders ImportCsvPanel with the queue name when the Import tab is active', async () => {
      const wrapper = mountView([makeQueue({ name: 'default' })])
      await flushPromises()
      await wrapper.findAll('.v-tab')[2].trigger('click')
      await flushPromises()

      const panel = wrapper.find('[data-testid="import-csv-panel"]')
      expect(panel.exists()).toBe(true)
      // The panel renders a file picker and an Import button.
      expect(panel.find('[data-testid="import-file"]').exists()).toBe(true)
    })

    it('calls reset() on the panel each time the Import tab is re-entered', async () => {
      const wrapper = mountView([makeQueue()])
      await flushPromises()

      // First entry into Import.
      await wrapper.findAll('.v-tab')[2].trigger('click')
      await flushPromises()
      const panelInstance = (wrapper.vm as unknown as {
        importPanel: { reset: () => void } | null
      }).importPanel
      expect(panelInstance).not.toBeNull()
      const resetSpy = vi.spyOn(panelInstance!, 'reset')

      // Switch away then come back — reset should run once.
      await wrapper.findAll('.v-tab')[1].trigger('click')
      await flushPromises()
      await wrapper.findAll('.v-tab')[2].trigger('click')
      await flushPromises()

      expect(resetSpy).toHaveBeenCalledTimes(1)
    })

    it('refreshes queues after the panel emits "imported"', async () => {
      const wrapper = mountView([makeQueue()])
      await flushPromises()
      await wrapper.findAll('.v-tab')[2].trigger('click')
      await flushPromises()

      const store = useQueuesStore()
      const refreshSpy = vi.spyOn(store, 'refreshQueues').mockResolvedValue()

      await wrapper
        .findComponent({ name: 'ImportCsvPanel' })
        .vm.$emit('imported', { published: 3, failed: 0, canceled: false })
      await flushPromises()

      expect(refreshSpy).toHaveBeenCalledOnce()
    })
  })
})
