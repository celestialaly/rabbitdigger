import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import CreateQueueDialog from './CreateQueueDialog.vue'
import { useQueuesStore } from '@/stores/queues'

const vuetify = createVuetify({ components, directives })

function mountDialog(modelValue = true) {
  return mount(CreateQueueDialog, {
    attachTo: document.body,
    props: { modelValue },
    global: {
      plugins: [
        createTestingPinia({ createSpy: vi.fn, stubActions: false }),
        vuetify,
      ],
    },
  })
}

function setInputValue(testId: string, value: string) {
  const input = document.querySelector(
    `[data-testid="${testId}"] input`,
  ) as HTMLInputElement
  input.value = value
  input.dispatchEvent(new Event('input'))
}

describe('CreateQueueDialog', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('does not render the dialog body when modelValue is false', () => {
    mountDialog(false)
    expect(document.querySelector('[data-testid="queue-name"]')).toBeNull()
  })

  it('disables the submit button when the name is empty', async () => {
    mountDialog()
    await flushPromises()
    const submit = document.querySelector(
      '[data-testid="create-queue-submit"]',
    ) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
  })

  it('rejects names starting with "amq." (reserved prefix)', async () => {
    mountDialog()
    await flushPromises()
    setInputValue('queue-name', 'amq.reserved')
    await flushPromises()
    const submit = document.querySelector(
      '[data-testid="create-queue-submit"]',
    ) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    expect(document.body.textContent).toContain('amq.')
  })

  it('calls createQueue with the typed name and emits created + close on success', async () => {
    const wrapper = mountDialog()
    await flushPromises()
    const store = useQueuesStore()
    const createQueueMock = vi
      .spyOn(store, 'createQueue')
      .mockResolvedValue(undefined)

    setInputValue('queue-name', 'orders')
    await flushPromises()

    ;(document.querySelector(
      '[data-testid="create-queue-submit"]',
    ) as HTMLElement).click()
    await flushPromises()

    expect(createQueueMock).toHaveBeenCalledWith({
      name: 'orders',
      type: 'classic',
      durable: true,
      auto_delete: false,
    })
    expect(wrapper.emitted('created')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })

  it('shows an error and stays open when createQueue rejects', async () => {
    const wrapper = mountDialog()
    await flushPromises()
    const store = useQueuesStore()
    vi.spyOn(store, 'createQueue').mockRejectedValue(
      new Error('HTTP 406: PRECONDITION_FAILED'),
    )

    setInputValue('queue-name', 'orders')
    await flushPromises()
    ;(document.querySelector(
      '[data-testid="create-queue-submit"]',
    ) as HTMLElement).click()
    await flushPromises()

    const alert = document.querySelector('[data-testid="create-queue-error"]')
    expect(alert?.textContent).toContain('HTTP 406')
    expect(wrapper.emitted('created')).toBeUndefined()
    // dialog stays open: no close emit since opening
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('emits update:modelValue=false when Cancel is clicked', async () => {
    const wrapper = mountDialog()
    await flushPromises()
    ;(document.querySelector(
      '[data-testid="create-queue-cancel"]',
    ) as HTMLElement).click()
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })

  it('trims surrounding whitespace from the name before submitting', async () => {
    mountDialog()
    await flushPromises()
    const store = useQueuesStore()
    const createQueueMock = vi
      .spyOn(store, 'createQueue')
      .mockResolvedValue(undefined)

    setInputValue('queue-name', '   orders   ')
    await flushPromises()
    ;(document.querySelector(
      '[data-testid="create-queue-submit"]',
    ) as HTMLElement).click()
    await flushPromises()

    expect(createQueueMock.mock.calls[0][0].name).toBe('orders')
  })
})
