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
      count: 25,
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
      count: 25,
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

  it('filters rows client-side based on body / routing key / exchange', async () => {
    const wrapper = mountComponent({ queueName: 'default' })
    const store = useQueueMessagesStore()
    store.messages = [
      makeMessage({ payload: 'order-123', routing_key: 'orders' }),
      makeMessage({ payload: 'invoice-9', routing_key: 'billing' }),
      makeMessage({ payload: 'misc', routing_key: 'misc', exchange: 'orders.x' }),
    ]
    store.lastFetchAt = new Date()
    await flushPromises()

    expect(wrapper.text()).toContain('order-123')
    expect(wrapper.text()).toContain('invoice-9')

    const input = wrapper.find('[data-testid="filter-input"] input')
    await input.setValue('order')
    await flushPromises()

    expect(wrapper.text()).toContain('order-123')
    expect(wrapper.text()).toContain('orders.x')
    expect(wrapper.text()).not.toContain('invoice-9')
    expect(wrapper.find('[data-testid="last-fetch"]').text()).toContain('2 / 3')
  })

  it('shows a dedicated empty-state message when the filter matches nothing', async () => {
    const wrapper = mountComponent({ queueName: 'default' })
    const store = useQueueMessagesStore()
    store.messages = [makeMessage({ payload: 'hello', routing_key: 'rk' })]
    store.lastFetchAt = new Date()
    await flushPromises()

    const input = wrapper.find('[data-testid="filter-input"] input')
    await input.setValue('zzz-no-match')
    await flushPromises()

    expect(wrapper.text()).toContain('No messages match the current filter.')
  })

  it('disables the filter input when no messages have been fetched', async () => {
    const wrapper = mountComponent({ queueName: 'default' })
    await flushPromises()
    const input = wrapper.find('[data-testid="filter-input"] input')
    expect((input.element as HTMLInputElement).disabled).toBe(true)
  })

  describe('CSV export', () => {
    beforeEach(() => {
      document.body.innerHTML = ''
    })

    it('disables the Export CSV button when there are no rows to export', async () => {
      const wrapper = mountComponent({ queueName: 'default' })
      await flushPromises()
      const btn = wrapper.find('[data-testid="export-btn"]')
      expect((btn.element as HTMLButtonElement).disabled).toBe(true)
    })

    it('opens the export dialog when Export CSV is clicked', async () => {
      const wrapper = mountComponent({ queueName: 'orders' })
      const store = useQueueMessagesStore()
      store.messages = [makeMessage({ payload: 'a' })]
      await flushPromises()
      await wrapper.find('[data-testid="export-btn"]').trigger('click')
      await flushPromises()
      expect(document.querySelector('[data-testid="export-info"]')).not.toBeNull()
      expect(
        document.querySelector('[data-testid="export-info"]')?.textContent,
      ).toContain('orders')
    })

    it('downloads a CSV with the configured columns and header on confirm', async () => {
      const wrapper = mountComponent({ queueName: 'orders' })
      const store = useQueueMessagesStore()
      store.messages = [
        makeMessage({
          payload: 'hello',
          payload_bytes: 5,
          routing_key: 'rk1',
          exchange: 'ex1',
          properties: { message_id: 'msg-1' },
        }),
        makeMessage({
          payload: 'YmluYXJ5',
          payload_encoding: 'base64',
          payload_bytes: 6,
          routing_key: 'rk2',
          exchange: 'ex2',
          properties: {},
        }),
      ]
      await flushPromises()

      const blobs: Blob[] = []
      const createUrl = vi
        .spyOn(URL, 'createObjectURL')
        .mockImplementation((b: Blob | MediaSource) => {
          blobs.push(b as Blob)
          return 'blob:mock'
        })
      const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
      const clicks: HTMLAnchorElement[] = []
      const origClick = HTMLAnchorElement.prototype.click
      HTMLAnchorElement.prototype.click = function () {
        clicks.push(this as HTMLAnchorElement)
      }

      try {
        await wrapper.find('[data-testid="export-btn"]').trigger('click')
        await flushPromises()
        ;(
          document.querySelector('[data-testid="export-confirm"]') as HTMLElement
        ).click()
        await flushPromises()

        expect(blobs).toHaveLength(1)
        const text = await blobs[0].text()
        const lines = text.split('\r\n')
        expect(lines[0]).toBe('id,size,body,routing key,source queue,source exchange')
        expect(lines[1]).toBe('msg-1,5,hello,rk1,orders,ex1')
        expect(lines[2]).toBe(',6,YmluYXJ5,rk2,orders,ex2')

        expect(clicks).toHaveLength(1)
        expect(clicks[0].download).toMatch(/^messages-orders-\d{8}-\d{6}\.csv$/)
      } finally {
        HTMLAnchorElement.prototype.click = origClick
        createUrl.mockRestore()
        revokeUrl.mockRestore()
      }
    })

    it('omits the header row when the checkbox is unchecked', async () => {
      const wrapper = mountComponent({ queueName: 'q' })
      const store = useQueueMessagesStore()
      store.messages = [makeMessage({ payload: 'p', routing_key: 'r' })]
      await flushPromises()

      const blobs: Blob[] = []
      const createUrl = vi
        .spyOn(URL, 'createObjectURL')
        .mockImplementation((b: Blob | MediaSource) => {
          blobs.push(b as Blob)
          return 'blob:mock'
        })
      const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
      const origClick = HTMLAnchorElement.prototype.click
      HTMLAnchorElement.prototype.click = function () {}

      try {
        await wrapper.find('[data-testid="export-btn"]').trigger('click')
        await flushPromises()
        const checkbox = document.querySelector(
          '[data-testid="csv-include-header"] input[type="checkbox"]',
        ) as HTMLInputElement
        checkbox.click()
        await flushPromises()
        ;(
          document.querySelector('[data-testid="export-confirm"]') as HTMLElement
        ).click()
        await flushPromises()

        const text = await blobs[0].text()
        expect(text).toBe(',5,p,r,q,')
      } finally {
        HTMLAnchorElement.prototype.click = origClick
        createUrl.mockRestore()
        revokeUrl.mockRestore()
      }
    })

    it('exports only the rows currently visible after filtering', async () => {
      const wrapper = mountComponent({ queueName: 'q' })
      const store = useQueueMessagesStore()
      store.messages = [
        makeMessage({ payload: 'order-1', routing_key: 'orders' }),
        makeMessage({ payload: 'invoice', routing_key: 'billing' }),
      ]
      store.lastFetchAt = new Date()
      await flushPromises()

      const input = wrapper.find('[data-testid="filter-input"] input')
      await input.setValue('order')
      await flushPromises()

      const blobs: Blob[] = []
      const createUrl = vi
        .spyOn(URL, 'createObjectURL')
        .mockImplementation((b: Blob | MediaSource) => {
          blobs.push(b as Blob)
          return 'blob:mock'
        })
      const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
      const origClick = HTMLAnchorElement.prototype.click
      HTMLAnchorElement.prototype.click = function () {}

      try {
        await wrapper.find('[data-testid="export-btn"]').trigger('click')
        await flushPromises()
        ;(
          document.querySelector('[data-testid="export-confirm"]') as HTMLElement
        ).click()
        await flushPromises()

        const text = await blobs[0].text()
        expect(text).toContain('order-1')
        expect(text).not.toContain('invoice')
      } finally {
        HTMLAnchorElement.prototype.click = origClick
        createUrl.mockRestore()
        revokeUrl.mockRestore()
      }
    })
  })

  describe('Message detail dialog', () => {
    beforeEach(() => {
      document.body.innerHTML = ''
    })

    it('opens the detail dialog with the clicked message', async () => {
      const wrapper = mountComponent({ queueName: 'q' })
      const store = useQueueMessagesStore()
      store.messages = [
        makeMessage({ payload: 'first', routing_key: 'rk-1' }),
        makeMessage({ payload: 'second body', routing_key: 'rk-2' }),
      ]
      store.lastFetchAt = new Date()
      await flushPromises()

      // The data-table renders one <tr> per message in <tbody>; click the
      // second row (index 1).
      const rows = wrapper.findAll('tbody tr')
      expect(rows.length).toBeGreaterThanOrEqual(2)
      await rows[1].trigger('click')
      await flushPromises()

      const body = document.querySelector('[data-testid="message-detail-body"]')
      expect(body).not.toBeNull()
      expect(body?.textContent).toBe('second body')
      expect(
        document.querySelector('[data-testid="message-detail-summary"]')?.textContent,
      ).toContain('rk-2')
    })
  })
})
