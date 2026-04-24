import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import QueueMessageList from './QueueMessageList.vue'
import { useQueueMessagesStore } from '@/stores/queueMessages'
import type { PeekedMessage } from '@/services/management'

const vuetify = createVuetify({ components, directives })

function makeMessage(overrides: Partial<PeekedMessage> = {}): PeekedMessage {
  return {
    payload: 'hello',
    payload_bytes: 5,
    payload_encoding: 'string',
    redelivered: false,
    exchange: '',
    routing_key: 'rk',
    message_count: 0,
    properties: {},
    ...overrides,
  }
}

function mountComponent(props: { queueName: string; queueType?: string }) {
  return mount(QueueMessageList, {
    props,
    global: {
      plugins: [
        createTestingPinia({ createSpy: vi.fn, stubActions: false }),
        vuetify,
      ],
    },
  })
}

describe('QueueMessageList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the stream notice and hides the form when queueType is "stream"', () => {
    const wrapper = mountComponent({ queueName: 'evt', queueType: 'stream' })
    expect(wrapper.find('[data-testid="stream-notice"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="fetch-btn"]').exists()).toBe(false)
  })

  it('calls store.fetchMessages with itemsPerPage as count + ack_requeue_true on Fetch', async () => {
    const wrapper = mountComponent({ queueName: 'default' })
    const store = useQueueMessagesStore()
    vi.spyOn(store, 'fetchMessages').mockResolvedValue(undefined)

    await wrapper.find('[data-testid="fetch-btn"]').trigger('click')
    await flushPromises()

    expect(store.fetchMessages).toHaveBeenCalledWith('default', {
      count: 10,
      requeue: true,
    })
  })

  it('passes requeue=false when the toggle is turned off', async () => {
    const wrapper = mountComponent({ queueName: 'default' })
    const store = useQueueMessagesStore()
    vi.spyOn(store, 'fetchMessages').mockResolvedValue(undefined)

    // Vuetify v-switch renders a hidden checkbox input
    const checkbox = wrapper.find('[data-testid="requeue-toggle"] input[type="checkbox"]')
    await checkbox.setValue(false)
    await wrapper.find('[data-testid="fetch-btn"]').trigger('click')
    await flushPromises()

    expect(store.fetchMessages).toHaveBeenCalledWith('default', {
      count: 10,
      requeue: false,
    })
    expect(wrapper.find('[data-testid="destructive-warning"]').exists()).toBe(true)
  })

  it('renders error alert when store.error is set', async () => {
    const wrapper = mountComponent({ queueName: 'default' })
    const store = useQueueMessagesStore()
    store.error = 'HTTP 404: not found'
    await flushPromises()
    expect(wrapper.find('[data-testid="error-alert"]').text()).toContain(
      'HTTP 404: not found',
    )
  })

  it('renders a "binary" badge for base64 payloads that are not UTF-8', async () => {
    const wrapper = mountComponent({ queueName: 'default' })
    const store = useQueueMessagesStore()
    const pngHeader = String.fromCharCode(0x89, 0x50, 0x4e, 0x47)
    store.messages = [
      makeMessage({
        payload: btoa(pngHeader),
        payload_bytes: 4,
        payload_encoding: 'base64',
      }),
    ]
    await flushPromises()
    expect(wrapper.text()).toContain('binary')
  })

  it('renders the decoded text for string payloads', async () => {
    const wrapper = mountComponent({ queueName: 'default' })
    const store = useQueueMessagesStore()
    store.messages = [makeMessage({ payload: 'order-123', routing_key: 'orders' })]
    await flushPromises()
    expect(wrapper.text()).toContain('order-123')
    expect(wrapper.text()).toContain('orders')
  })
})
