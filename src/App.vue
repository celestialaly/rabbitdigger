<template>
  <v-app>
    <v-navigation-drawer v-if="isConnected" permanent>
      <v-list-item
        title="RabbitDigger"
        subtitle="RabbitMQ Explorer"
        prepend-icon="mdi-rabbit"
        nav
      />
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
import { computed } from 'vue'
import { useConnectionStore } from '@/stores/connection'

const connectionStore = useConnectionStore()
const isConnected = computed(() => connectionStore.status === 'connected')

const navItems = [
  { title: 'Dashboard', icon: 'mdi-view-dashboard', to: '/' },
  { title: 'Queues', icon: 'mdi-tray-full', to: '/queues' },
  { title: 'Exchanges', icon: 'mdi-swap-horizontal', to: '/exchanges' },
  { title: 'Publish', icon: 'mdi-send', to: '/publish' },
  { title: 'Consume', icon: 'mdi-inbox-arrow-down', to: '/consume' },
]
</script>
