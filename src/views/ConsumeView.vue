<template>
  <v-container fluid class="pa-6">
    <div class="text-h5 mb-4">Consume Messages</div>

    <v-alert
      v-if="!connectionStore.stompEnabled"
      type="info"
      variant="tonal"
      class="mb-4"
      data-testid="stomp-disabled-alert"
    >
      <div class="text-subtitle-2">Le plugin STOMP n'est pas activé sur RabbitMQ.</div>
      <div class="text-body-2">
        La consommation temps réel est indisponible. Activez le plugin
        <code>rabbitmq_web_stomp</code> sur le broker puis reconnectez-vous.
        Les autres fonctionnalités (queues, messages, exchanges, publication) restent disponibles.
      </div>
    </v-alert>

    <template v-else>
      <div class="d-flex align-center ga-3 mb-6">
        <v-text-field
          v-model="queueName"
          label="Queue name"
          placeholder="my-queue"
          variant="outlined"
          density="compact"
          hide-details
          style="max-width: 320px"
          :disabled="!!activeSubscription"
        />
        <v-btn
          v-if="!activeSubscription"
          color="green"
          prepend-icon="mdi-play"
          @click="startConsuming"
          :disabled="!queueName"
        >
          Subscribe
        </v-btn>
        <v-btn
          v-else
          color="red"
          prepend-icon="mdi-stop"
          @click="stopConsuming"
        >
          Unsubscribe
        </v-btn>
        <v-btn variant="text" icon="mdi-delete-sweep" title="Clear messages" @click="messagesStore.clearMessages()" />

        <v-chip v-if="activeSubscription" color="green" size="small">
          <v-icon start>mdi-circle</v-icon>
          Listening on {{ queueName }}
        </v-chip>
      </div>

      <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>

      <v-data-table
        :headers="headers"
        :items="messagesStore.messages"
        density="compact"
        hover
        :items-per-page="25"
      >
        <template #item.timestamp="{ item }">
          {{ item.timestamp.toLocaleTimeString() }}
        </template>
        <template #item.body="{ item }">
          <code class="text-caption">{{ truncate(item.body, 120) }}</code>
        </template>
        <template #item.actions="{ item }">
          <v-btn size="x-small" color="green" variant="text" @click="item.ack()">ACK</v-btn>
          <v-btn size="x-small" color="red" variant="text" @click="item.nack()">NACK</v-btn>
        </template>
      </v-data-table>
    </template>
  </v-container>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { StompSubscription } from '@stomp/stompjs'
import { subscribe } from '@/services/stomp'
import { useConnectionStore } from '@/stores/connection'
import { useMessagesStore } from '@/stores/messages'
import { nanoid } from '@/utils/nanoid'

const connectionStore = useConnectionStore()
const messagesStore = useMessagesStore()
const queueName = ref('')
const error = ref<string | null>(null)
const activeSubscription = ref<StompSubscription | null>(null)

const headers = [
  { title: 'Time', key: 'timestamp', width: 100 },
  { title: 'Queue', key: 'queue', width: 160 },
  { title: 'Body', key: 'body' },
  { title: 'Actions', key: 'actions', width: 120, sortable: false },
]

function startConsuming() {
  error.value = null
  if (!connectionStore.stompEnabled) {
    error.value = 'STOMP plugin not enabled on the broker.'
    return
  }
  const sub = subscribe(queueName.value, (msg) => {
    messagesStore.addMessage({
      id: nanoid(),
      queue: queueName.value,
      body: msg.body,
      headers: msg.headers as Record<string, unknown>,
      timestamp: new Date(),
      ack: () => msg.ack(),
      nack: () => msg.nack(),
    })
  })
  if (!sub) {
    error.value = 'Not connected via STOMP. Please reconnect.'
    return
  }
  activeSubscription.value = sub
}

function stopConsuming() {
  activeSubscription.value?.unsubscribe()
  activeSubscription.value = null
}

function truncate(str: string, len: number) {
  return str.length > len ? str.slice(0, len) + '…' : str
}
</script>
