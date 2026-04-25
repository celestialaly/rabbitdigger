import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import ExportCsvDialog from './ExportCsvDialog.vue'

const vuetify = createVuetify({ components, directives })

function mountDialog(props: {
  modelValue: boolean
  queueName: string
  messageCount: number
}) {
  return mount(ExportCsvDialog, {
    attachTo: document.body,
    props,
    global: { plugins: [vuetify] },
  })
}

describe('ExportCsvDialog', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders the queue name and message count when open', async () => {
    mountDialog({ modelValue: true, queueName: 'orders', messageCount: 42 })
    await flushPromises()
    const info = document.querySelector('[data-testid="export-info"]')
    expect(info?.textContent).toContain('orders')
    expect(info?.textContent).toContain('42')
  })

  it('emits confirm with the default separator, quote and includeHeader', async () => {
    const wrapper = mountDialog({
      modelValue: true,
      queueName: 'q',
      messageCount: 1,
    })
    await flushPromises()
    const confirm = document.querySelector(
      '[data-testid="export-confirm"]',
    ) as HTMLElement
    confirm.click()
    await flushPromises()

    expect(wrapper.emitted('confirm')).toEqual([
      [{ separator: ',', quote: '"', includeHeader: true }],
    ])
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })

  it('emits confirm with custom separator and quote', async () => {
    const wrapper = mountDialog({
      modelValue: true,
      queueName: 'q',
      messageCount: 1,
    })
    await flushPromises()
    const sep = document.querySelector(
      '[data-testid="csv-separator"] input',
    ) as HTMLInputElement
    const del = document.querySelector(
      '[data-testid="csv-delimiter"] input',
    ) as HTMLInputElement
    sep.value = ';'
    sep.dispatchEvent(new Event('input'))
    del.value = "'"
    del.dispatchEvent(new Event('input'))
    await flushPromises()

    const checkbox = document.querySelector(
      '[data-testid="csv-include-header"] input[type="checkbox"]',
    ) as HTMLInputElement
    checkbox.click()
    await flushPromises()

    ;(document.querySelector('[data-testid="export-confirm"]') as HTMLElement).click()
    await flushPromises()

    expect(wrapper.emitted('confirm')?.[0]).toEqual([
      { separator: ';', quote: "'", includeHeader: false },
    ])
  })

  it('disables Export when separator and delimiter are equal', async () => {
    mountDialog({ modelValue: true, queueName: 'q', messageCount: 1 })
    await flushPromises()
    const sep = document.querySelector(
      '[data-testid="csv-separator"] input',
    ) as HTMLInputElement
    sep.value = '"'
    sep.dispatchEvent(new Event('input'))
    await flushPromises()
    const confirm = document.querySelector(
      '[data-testid="export-confirm"]',
    ) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
  })

  it('emits update:modelValue=false when Cancel is clicked', async () => {
    const wrapper = mountDialog({
      modelValue: true,
      queueName: 'q',
      messageCount: 1,
    })
    await flushPromises()
    ;(document.querySelector('[data-testid="export-cancel"]') as HTMLElement).click()
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('does not render the dialog body when modelValue is false', () => {
    mountDialog({ modelValue: false, queueName: 'q', messageCount: 0 })
    expect(document.querySelector('[data-testid="export-info"]')).toBeNull()
  })
})
