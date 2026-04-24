import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import ConnectView from './ConnectView.vue'
import { useConnectionStore } from '@/stores/connection'

const pushMock = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}))

const vuetify = createVuetify({ components, directives })

function mountView() {
  return mount(ConnectView, {
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
              status: 'disconnected',
              error: null,
            },
          },
        }),
        vuetify,
      ],
    },
  })
}

describe('ConnectView', () => {
  beforeEach(() => {
    pushMock.mockReset()
  })

  it('calls connectionStore.connect() on submit', async () => {
    const wrapper = mountView()
    const store = useConnectionStore()
    vi.spyOn(store, 'connect').mockResolvedValue(undefined)

    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    expect(store.connect).toHaveBeenCalledOnce()
  })

  it('redirects to "/" when connect succeeds', async () => {
    const wrapper = mountView()
    const store = useConnectionStore()
    vi.spyOn(store, 'connect').mockImplementation(async () => {
      store.status = 'connected'
    })

    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    expect(pushMock).toHaveBeenCalledWith('/')
  })

  it('does not redirect when connect ends in error', async () => {
    const wrapper = mountView()
    const store = useConnectionStore()
    vi.spyOn(store, 'connect').mockImplementation(async () => {
      store.status = 'error'
      store.error = 'WebSocket connection failed'
    })

    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    expect(pushMock).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('WebSocket connection failed')
  })

  it('shows the error alert when the store has an error', async () => {
    const wrapper = mountView()
    const store = useConnectionStore()
    store.error = 'boom'
    await flushPromises()
    expect(wrapper.text()).toContain('boom')
  })
})
