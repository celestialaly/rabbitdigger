<template>
  <v-app>
    <v-navigation-drawer v-if="isConnected" permanent>
      <v-list-item prepend-icon="mdi-rabbit" nav>
        <v-list-item-title>RabbitDigger</v-list-item-title>
        <v-list-item-subtitle>host: {{ connectionStore.host }}</v-list-item-subtitle>
        <v-list-item-subtitle>vhost: {{ connectionStore.vhost }}</v-list-item-subtitle>
      </v-list-item>
      <v-divider />
      <v-list density="compact" nav>
        <v-list-item
          v-for="item in navItems"
          :key="item.to"
          :prepend-icon="item.icon"
          :title="item.title"
          :to="item.to"
        />
      </v-list>
    </v-navigation-drawer>

    <v-main>
      <router-view />
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useConnectionStore, INACTIVITY_MS } from '@/stores/connection'
import { useInactivityTimeout } from '@/composables/useInactivityTimeout'

const connectionStore = useConnectionStore()
const router = useRouter()
const route = useRoute()
const isConnected = computed(() => connectionStore.status === 'connected')

const inactivity = useInactivityTimeout(
  INACTIVITY_MS,
  () => {
    connectionStore.disconnect()
    router.push({ path: '/connect', query: { expired: '1' } })
  },
  () => connectionStore.touch(),
)

onMounted(() => {
  // Restore the broker settings (host/ports/vhost/username) from the previous
  // session so the connection form is pre-filled. The password is intentionally
  // not persisted — see ADR 0009 — so the user still has to re-enter it.
  connectionStore.hydrateFromStorage()
})

watch(
  isConnected,
  (connected) => {
    if (connected) inactivity.start()
    else inactivity.stop()
  },
  { immediate: true },
)

watch(
  () => route.fullPath,
  (fullPath) => {
    if (isConnected.value && route.name !== 'connect') {
      connectionStore.rememberRoute(fullPath)
    }
  },
)

const navItems = [
  { title: 'Dashboard', icon: 'mdi-view-dashboard', to: '/' },
  { title: 'Queues', icon: 'mdi-tray-full', to: '/queues' },
  { title: 'Exchanges', icon: 'mdi-swap-horizontal', to: '/exchanges' },
  { title: 'Publish', icon: 'mdi-send', to: '/publish' },
  { title: 'Consume', icon: 'mdi-inbox-arrow-down', to: '/consume' },
]
</script>
