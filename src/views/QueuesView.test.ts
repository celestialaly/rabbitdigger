import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { createMemoryHistory, createRouter } from 'vue-router'
import QueuesView from './QueuesView.vue'

const vuetify = createVuetify({ components, directives })

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/queues/:name', name: 'queue-detail', component: { template: '<div />' } },
    ],
  })
}

describe('QueuesView', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('opens the create-queue dialog when the toolbar button is clicked', async () => {
    const wrapper = mount(QueuesView, {
      attachTo: document.body,
      global: {
        plugins: [
          createTestingPinia({ createSpy: vi.fn, stubActions: false }),
          vuetify,
          makeRouter(),
        ],
      },
    })
    await flushPromises()

    expect(document.querySelector('[data-testid="queue-name"]')).toBeNull()

    const btn = wrapper.find('[data-testid="new-queue-btn"]')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    await flushPromises()

    expect(document.querySelector('[data-testid="queue-name"]')).not.toBeNull()
  })
})
