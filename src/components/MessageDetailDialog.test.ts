import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import MessageDetailDialog from './MessageDetailDialog.vue'
import type { PeekedMessage } from '@/services/management'

const vuetify = createVuetify({ components, directives })

function makeMessage(overrides: Partial<PeekedMessage> = {}): PeekedMessage {
  return {
    payload: 'hello world',
    payload_bytes: 11,
    payload_encoding: 'string',
    redelivered: false,
    exchange: 'amq.direct',
    routing_key: 'rk',
    message_count: 0,
    properties: {},
    ...overrides,
  }
}

function mountDialog(props: { modelValue: boolean; message: PeekedMessage | null }) {
  return mount(MessageDetailDialog, {
    attachTo: document.body,
    props,
    global: { plugins: [vuetify] },
  })
}

describe('MessageDetailDialog', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('does not render the dialog body when modelValue is false', () => {
    mountDialog({ modelValue: false, message: makeMessage() })
    expect(document.querySelector('[data-testid="message-detail-body"]')).toBeNull()
  })

  it('renders the full body, summary, properties and headers when open', async () => {
    const message = makeMessage({
      payload: 'hello world',
      payload_bytes: 11,
      properties: {
        message_id: 'msg-42',
        content_type: 'text/plain',
        headers: { 'x-trace': 'abc' },
      },
    })
    mountDialog({ modelValue: true, message })
    await flushPromises()

    expect(document.querySelector('[data-testid="message-detail-body"]')?.textContent).toBe(
      'hello world',
    )

    const summary = document.querySelector('[data-testid="message-detail-summary"]')?.textContent ?? ''
    expect(summary).toContain('msg-42')
    expect(summary).toContain('rk')
    expect(summary).toContain('amq.direct')
    expect(summary).toContain('11')

    // Properties block excludes `headers` (rendered separately).
    const propsBlock = document.querySelector('[data-testid="message-detail-properties"]')?.textContent ?? ''
    expect(propsBlock).toContain('message_id')
    expect(propsBlock).toContain('text/plain')
    expect(propsBlock).not.toContain('x-trace')

    const headersBlock = document.querySelector('[data-testid="message-detail-headers"]')?.textContent ?? ''
    expect(headersBlock).toContain('x-trace')
  })

  it('decodes a base64 UTF-8 payload to readable text', async () => {
    const message = makeMessage({
      payload: 'SGVsbG8gd29ybGQ=', // "Hello world"
      payload_bytes: 11,
      payload_encoding: 'base64',
    })
    mountDialog({ modelValue: true, message })
    await flushPromises()
    expect(document.querySelector('[data-testid="message-detail-body"]')?.textContent).toBe(
      'Hello world',
    )
  })

  it('keeps a non-UTF-8 base64 payload as-is and flags it as binary', async () => {
    // 0xff 0xfe 0xfd → invalid UTF-8 ⇒ decodePayload keeps the base64 string
    // and marks the payload as binary.
    const message = makeMessage({
      payload: '//79',
      payload_bytes: 3,
      payload_encoding: 'base64',
    })
    mountDialog({ modelValue: true, message })
    await flushPromises()
    expect(document.querySelector('[data-testid="message-detail-body"]')?.textContent).toBe('//79')
    // The "binary" chip is in the title row.
    const dialog = document.querySelector('[data-testid="message-detail-dialog"]')
    expect(dialog?.textContent).toContain('binary (base64)')
  })

  it('emits update:modelValue=false when Close is clicked', async () => {
    const wrapper = mountDialog({ modelValue: true, message: makeMessage() })
    await flushPromises()
    ;(document.querySelector('[data-testid="message-detail-close"]') as HTMLElement).click()
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })

  it('copies the decoded body to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    mountDialog({
      modelValue: true,
      message: makeMessage({ payload: 'copy me', payload_bytes: 7 }),
    })
    await flushPromises()
    ;(document.querySelector('[data-testid="message-detail-copy"]') as HTMLElement).click()
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith('copy me')
  })
})
