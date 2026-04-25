import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import ConnectView from './ConnectView.vue'
import { useConnectionStore } from '@/stores/connection'

const pushMock = vi.fn()
const routeQuery: { expired?: string } = {}
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
  useRoute: () => ({ query: routeQuery }),
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
              lastActivity: 0,
              lastRoute: null,
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
    delete routeQuery.expired
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

  it('shows the session-expired alert when redirected with ?expired=1', () => {
    routeQuery.expired = '1'
    const wrapper = mountView()
    expect(wrapper.find('[data-testid="session-expired-alert"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Session expirée')
  })

  it('redirects to the last visited route after a fresh successful login', async () => {
    const wrapper = mountView()
    const store = useConnectionStore()
    store.lastRoute = '/queues/foo'
    store.lastActivity = Date.now()
    vi.spyOn(store, 'connect').mockImplementation(async () => {
      store.status = 'connected'
    })

    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    expect(pushMock).toHaveBeenCalledWith('/queues/foo')
  })

  it('falls back to "/" when the last route is older than the inactivity window', async () => {
    const wrapper = mountView()
    const store = useConnectionStore()
    store.lastRoute = '/queues/foo'
    store.lastActivity = Date.now() - 10 * 60 * 1000
    vi.spyOn(store, 'connect').mockImplementation(async () => {
      store.status = 'connected'
    })

    await wrapper.find('form').trigger('submit.prevent')
    await flushPromises()

    expect(pushMock).toHaveBeenCalledWith('/')
  })
})
