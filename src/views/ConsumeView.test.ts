import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import ConsumeView from './ConsumeView.vue'
import { subscribe } from '@/services/stomp'

vi.mock('@/services/stomp', () => ({
  subscribe: vi.fn(),
  connectStomp: vi.fn(),
  disconnectStomp: vi.fn(),
  stompStatus: { value: 'disconnected' },
  stompError: { value: null },
}))

const vuetify = createVuetify({ components, directives })

function mountView(stompEnabled: boolean) {
  return mount(ConsumeView, {
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          stubActions: false,
          initialState: {
            connection: {
              host: 'localhost',
              managementPort: 15672,
              stompPort: 15674,
              username: 'guest',
              password: 'guest',
              vhost: '/',
              status: 'connected',
              error: null,
              stompEnabled,
            },
          },
        }),
        vuetify,
      ],
    },
  })
}

describe('ConsumeView', () => {
  beforeEach(() => {
    vi.mocked(subscribe).mockReset()
  })

  it('renders the disabled-state alert and hides the consumer UI when STOMP is unavailable', () => {
    const wrapper = mountView(false)

    expect(wrapper.find('[data-testid="stomp-disabled-alert"]').exists()).toBe(true)
    expect(wrapper.text()).toContain("Le plugin STOMP n'est pas activé sur RabbitMQ")
    // Subscribe button must not be present
    expect(wrapper.text()).not.toContain('Subscribe')
  })

  it('renders the consumer UI and calls subscribe() when STOMP is enabled', async () => {
    vi.mocked(subscribe).mockReturnValue({ id: 'sub-1', unsubscribe: vi.fn() } as never)

    const wrapper = mountView(true)
    expect(wrapper.find('[data-testid="stomp-disabled-alert"]').exists()).toBe(false)

    const input = wrapper.find('input')
    await input.setValue('my-queue')

    const subscribeBtn = wrapper
      .findAll('button')
      .find((b) => b.text().includes('Subscribe'))
    expect(subscribeBtn).toBeDefined()
    await subscribeBtn!.trigger('click')

    expect(subscribe).toHaveBeenCalledWith('my-queue', expect.any(Function))
  })
})
