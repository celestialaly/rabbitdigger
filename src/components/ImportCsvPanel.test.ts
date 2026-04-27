import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

vi.mock('@/services/management', async () => {
  const actual = await vi.importActual<typeof import('@/services/management')>(
    '@/services/management',
  )
  return {
    ...actual,
    management: { publishMessage: vi.fn() },
  }
})

import ImportCsvPanel from './ImportCsvPanel.vue'
import { management } from '@/services/management'

const vuetify = createVuetify({ components, directives })

const HEADER_LINE = 'id,size,body,routing key,source queue,source exchange'

function mountPanel(props: { queueName: string } = { queueName: 'orders' }) {
  return mount(ImportCsvPanel, {
    attachTo: document.body,
    props,
    global: { plugins: [vuetify] },
  })
}

/**
 * Programmatically attach a CSV blob to the v-file-input so the watcher
 * picks it up exactly as a real `<input type="file">` change would.
 */
async function loadCsv(wrapper: VueWrapper, csv: string, filename = 'messages.csv'): Promise<void> {
  const input = wrapper.find('input[type="file"]').element as HTMLInputElement
  const file = new File([csv], filename, { type: 'text/csv' })
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  input.dispatchEvent(new Event('change'))
  // Two flush cycles: one for the change event → ref update, one for the
  // async file.text() promise resolution.
  await flushPromises()
  await flushPromises()
}

describe('ImportCsvPanel', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.mocked(management.publishMessage).mockReset()
    vi.mocked(management.publishMessage).mockResolvedValue({ routed: true })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders the file picker and a disabled Import button initially', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    expect(wrapper.find('[data-testid="import-file"]').exists()).toBe(true)
    const confirm = wrapper.find('[data-testid="import-confirm"]')
    expect(confirm.attributes('disabled')).toBeDefined()
  })

  it('parses a header-bearing CSV, shows the preview and enables Import', async () => {
    const wrapper = mountPanel()
    const csv = [
      HEADER_LINE,
      'msg-1,5,hello,rk,q,ex',
      'msg-2,5,world,rk,q,ex',
    ].join('\r\n')
    await loadCsv(wrapper, csv)

    const info = document.querySelector('[data-testid="import-info"]')
    expect(info?.textContent).toContain('2 message(s)')
    expect(info?.textContent).toContain('orders')
    expect(info?.textContent).toContain('header row detected')

    const preview = document.querySelector('[data-testid="import-preview-table"]')
    expect(preview?.textContent).toContain('msg-1')
    expect(preview?.textContent).toContain('hello')

    const confirm = wrapper.find('[data-testid="import-confirm"]')
    expect(confirm.attributes('disabled')).toBeUndefined()
  })

  it('treats a CSV without header as data', async () => {
    const wrapper = mountPanel()
    await loadCsv(wrapper, 'msg-1,5,hello,rk,q,ex')
    const info = document.querySelector('[data-testid="import-info"]')
    expect(info?.textContent).toContain('1 message(s)')
    expect(info?.textContent).not.toContain('header row detected')
  })

  it('detects payload_encoding=base64 for base64-looking bodies in the preview', async () => {
    const wrapper = mountPanel()
    await loadCsv(wrapper, ['msg-1,11,SGVsbG8gd29ybGQ=,rk,q,ex'].join('\r\n'))
    const preview = document.querySelector('[data-testid="import-preview-table"]')
    expect(preview?.textContent).toContain('base64')
  })

  it('disables Import and shows validation error when a row has wrong column count', async () => {
    const wrapper = mountPanel()
    const csv = [HEADER_LINE, 'msg-1,5,hello'].join('\r\n')
    await loadCsv(wrapper, csv)

    const validation = document.querySelector('[data-testid="import-validation"]')
    expect(validation?.textContent).toContain('expected 6 columns, got 3')

    const confirm = wrapper.find('[data-testid="import-confirm"]')
    expect(confirm.attributes('disabled')).toBeDefined()
  })

  it('shows a parse error and disables Import on a malformed CSV', async () => {
    const wrapper = mountPanel()
    await loadCsv(wrapper, 'a,b,"unterminated')
    const err = document.querySelector('[data-testid="import-parse-error"]')
    expect(err?.textContent).toContain('CSV parse error')
    const confirm = wrapper.find('[data-testid="import-confirm"]')
    expect(confirm.attributes('disabled')).toBeDefined()
  })

  it('publishes each row via management.publishMessage with message_id and detected encoding', async () => {
    const wrapper = mountPanel({ queueName: 'orders' })
    const csv = [
      HEADER_LINE,
      'msg-1,5,hello,rk-ignored,src-q,src-ex',
      ',11,SGVsbG8gd29ybGQ=,rk,q,ex',
    ].join('\r\n')
    await loadCsv(wrapper, csv)

    await wrapper.find('[data-testid="import-confirm"]').trigger('click')
    await flushPromises()

    const calls = vi.mocked(management.publishMessage).mock.calls
    expect(calls).toHaveLength(2)
    // First row: string encoding, message_id preserved
    expect(calls[0]).toEqual([
      '',
      'orders',
      'hello',
      { payloadEncoding: 'string', properties: { message_id: 'msg-1' } },
    ])
    // Second row: empty id => no properties, base64 encoding
    expect(calls[1]).toEqual([
      '',
      'orders',
      'SGVsbG8gd29ybGQ=',
      { payloadEncoding: 'base64', properties: undefined },
    ])

    const result = document.querySelector('[data-testid="import-result"]')
    expect(result?.textContent).toContain('Published 2 message(s)')

    expect(wrapper.emitted('imported')).toEqual([
      [{ published: 2, failed: 0, canceled: false }],
    ])
  })

  it('reports failed publishes without aborting the batch', async () => {
    vi.mocked(management.publishMessage)
      .mockResolvedValueOnce({ routed: true })
      .mockRejectedValueOnce(new Error('broker down'))
      .mockResolvedValueOnce({ routed: true })
    const wrapper = mountPanel()
    const csv = [
      'a,1,one,rk,q,ex',
      'b,1,two,rk,q,ex',
      'c,1,three,rk,q,ex',
    ].join('\r\n')
    await loadCsv(wrapper, csv)
    await wrapper.find('[data-testid="import-confirm"]').trigger('click')
    await flushPromises()

    expect(vi.mocked(management.publishMessage)).toHaveBeenCalledTimes(3)
    const result = document.querySelector('[data-testid="import-result"]')
    expect(result?.textContent).toContain('Published 2 message(s)')
    expect(result?.textContent).toContain('1 failed')
    expect(wrapper.emitted('imported')?.[0]).toEqual([
      { published: 2, failed: 1, canceled: false },
    ])
  })

  it('reset() clears file, parsed state and result', async () => {
    const wrapper = mountPanel()
    const csv = [HEADER_LINE, 'msg-1,5,hello,rk,q,ex'].join('\r\n')
    await loadCsv(wrapper, csv)
    expect(document.querySelector('[data-testid="import-info"]')).not.toBeNull()

    ;(wrapper.vm as unknown as { reset: () => void }).reset()
    await flushPromises()

    expect(document.querySelector('[data-testid="import-info"]')).toBeNull()
    expect(document.querySelector('[data-testid="import-preview-table"]')).toBeNull()
    const confirm = wrapper.find('[data-testid="import-confirm"]')
    expect(confirm.attributes('disabled')).toBeDefined()
  })
})
