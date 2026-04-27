<template>
  <v-container fluid class="pa-6">
    <div class="d-flex align-center mb-4">
      <v-btn
        icon="mdi-arrow-left"
        variant="text"
        :to="{ name: 'queues' }"
        title="Back to queues"
      />
      <div class="text-h5 ml-2">
        Queue: <span class="font-weight-bold">{{ name }}</span>
      </div>
      <v-spacer />
      <v-chip
        v-if="queue"
        :color="queue.state === 'running' ? 'green' : 'red'"
        size="small"
        class="mr-2"
      >
        {{ queue.state }}
      </v-chip>
      <v-chip v-if="queue?.type" size="small" variant="outlined">
        {{ queue.type }}
      </v-chip>
    </div>

    <v-alert
      v-if="!queuesStore.loading && !queue"
      type="warning"
      variant="tonal"
      class="mb-4"
      data-testid="queue-not-found"
    >
      Queue <code>{{ name }}</code> not found on the connected vhost.
    </v-alert>

    <v-tabs v-model="tab" color="primary" data-testid="tabs">
      <v-tab value="details">Details</v-tab>
      <v-tab value="messages">Messages</v-tab>
      <v-tab value="import">Import</v-tab>
    </v-tabs>

    <v-window v-model="tab" class="mt-4">
      <v-window-item value="details">
        <v-card v-if="queue" variant="outlined">
          <v-list density="compact">
            <v-list-item v-for="row in detailRows" :key="row.label">
              <template #prepend>
                <span class="text-medium-emphasis mr-4" style="min-width: 180px; display: inline-block">
                  {{ row.label }}
                </span>
              </template>
              <span class="text-body-2">{{ row.value }}</span>
            </v-list-item>
          </v-list>
        </v-card>
      </v-window-item>

      <v-window-item value="messages">
        <QueueMessageList :queue-name="name" :queue-type="queue?.type" />
      </v-window-item>

      <v-window-item value="import">
        <ImportCsvPanel
          ref="importPanel"
          :queue-name="name"
          @imported="onImported"
        />
      </v-window-item>
    </v-window>
  </v-container>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useQueuesStore } from '@/stores/queues'
import { useQueueMessagesStore } from '@/stores/queueMessages'
import QueueMessageList from '@/components/QueueMessageList.vue'
import ImportCsvPanel from '@/components/ImportCsvPanel.vue'

const props = defineProps<{ name: string }>()

const queuesStore = useQueuesStore()
const messagesStore = useQueueMessagesStore()
const tab = ref<'details' | 'messages' | 'import'>('messages')
const importPanel = ref<InstanceType<typeof ImportCsvPanel> | null>(null)

// Reset the import panel state every time the user enters the tab so a new
// import session starts from a clean slate (no leftover file, parsed rows or
// progress from the previous visit).
watch(tab, (next, prev) => {
  if (next === 'import' && prev !== 'import') {
    importPanel.value?.reset()
  }
})

/**
 * After a successful (or partial) import, refresh the queues cache so the
 * new `messages_ready` / `messages` counters propagate to the rest of the UI.
 */
function onImported(_result: { published: number; failed: number; canceled: boolean }): void {
  void queuesStore.refreshQueues()
}

const queue = computed(() =>
  queuesStore.queues.find((q) => q.name === props.name) ?? null,
)

const detailRows = computed(() => {
  const q = queue.value
  if (!q) return []
  return [
    { label: 'Name', value: q.name },
    { label: 'VHost', value: q.vhost },
    { label: 'Type', value: q.type ?? 'classic' },
    { label: 'State', value: q.state },
    { label: 'Durable', value: q.durable ? 'yes' : 'no' },
    { label: 'Auto-delete', value: q.auto_delete ? 'yes' : 'no' },
    { label: 'Messages (total)', value: q.messages },
    { label: 'Messages ready', value: q.messages_ready },
    { label: 'Messages unacked', value: q.messages_unacknowledged },
    { label: 'Consumers', value: q.consumers },
  ]
})

onMounted(() => {
  if (queuesStore.queues.length === 0) {
    queuesStore.refreshQueues()
  }
})

onUnmounted(() => {
  // Ensure no stale message list lingers when navigating away.
  messagesStore.clear()
})
</script>
