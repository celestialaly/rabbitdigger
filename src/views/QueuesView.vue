<template>
  <v-container fluid class="pa-6">
    <div class="d-flex align-center mb-4">
      <div class="text-h5">Queues</div>
      <v-spacer />
      <v-btn
        color="primary"
        variant="flat"
        prepend-icon="mdi-plus"
        class="mr-3"
        data-testid="new-queue-btn"
        @click="dialogOpen = true"
      >
        New queue
      </v-btn>
      <v-text-field
        v-model="search"
        placeholder="Search"
        prepend-inner-icon="mdi-magnify"
        variant="outlined"
        density="compact"
        hide-details
        style="max-width: 260px"
        class="mr-3"
      />
      <v-btn icon="mdi-refresh" variant="text" :loading="store.loading" @click="store.refreshQueues()" />
    </div>

    <v-data-table
      :headers="headers"
      :items="filtered"
      :loading="store.loading"
      density="compact"
      hover
    >
      <template #item.name="{ item }">
        <RouterLink
          :to="{ name: 'queue-detail', params: { name: item.name } }"
          class="text-primary"
        >
          {{ item.name }}
        </RouterLink>
      </template>
      <template #item.state="{ item }">
        <v-chip :color="item.state === 'running' ? 'green' : 'red'" size="x-small">
          {{ item.state }}
        </v-chip>
      </template>
      <template #item.durable="{ item }">
        <v-icon :color="item.durable ? 'green' : 'grey'" size="small">
          {{ item.durable ? 'mdi-check' : 'mdi-close' }}
        </v-icon>
      </template>
    </v-data-table>

    <CreateQueueDialog v-model="dialogOpen" />
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useQueuesStore } from '@/stores/queues'
import CreateQueueDialog from '@/components/CreateQueueDialog.vue'

const store = useQueuesStore()
const search = ref('')
const dialogOpen = ref(false)

const headers = [
  { title: 'Name', key: 'name' },
  { title: 'VHost', key: 'vhost' },
  { title: 'State', key: 'state' },
  { title: 'Durable', key: 'durable' },
  { title: 'Ready', key: 'messages_ready' },
  { title: 'Unacked', key: 'messages_unacknowledged' },
  { title: 'Consumers', key: 'consumers' },
]

const filtered = computed(() =>
  store.queues.filter((q) =>
    q.name.toLowerCase().includes(search.value.toLowerCase()),
  ),
)

onMounted(() => store.refreshQueues())
</script>
