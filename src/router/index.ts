import { createRouter, createWebHistory } from 'vue-router'
import { useConnectionStore } from '@/stores/connection'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/connect',
      name: 'connect',
      component: () => import('@/views/ConnectView.vue'),
    },
    {
      path: '/',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/queues',
      name: 'queues',
      component: () => import('@/views/QueuesView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/queues/:name',
      name: 'queue-detail',
      component: () => import('@/views/QueueDetailView.vue'),
      meta: { requiresAuth: true },
      props: true,
    },
    {
      path: '/exchanges',
      name: 'exchanges',
      component: () => import('@/views/ExchangesView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/publish',
      name: 'publish',
      component: () => import('@/views/PublishView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/consume',
      name: 'consume',
      component: () => import('@/views/ConsumeView.vue'),
      meta: { requiresAuth: true },
    },
  ],
})

router.beforeEach((to) => {
  const connectionStore = useConnectionStore()
  if (to.meta.requiresAuth && connectionStore.status !== 'connected') {
    return { name: 'connect' }
  }
})

export default router
