<template>
  <div>
    <v-alert
      v-if="isStream"
      type="info"
      variant="tonal"
      class="mb-4"
      data-testid="stream-notice"
    >
      This queue is of type <strong>stream</strong>. The
      <code>POST /api/queues/&hellip;/get</code> API does not support streams.
    </v-alert>

    <div v-else>
      <div class="d-flex align-center ga-3 mb-4 flex-wrap">
        <v-btn
          color="primary"
          prepend-icon="mdi-download"
          :loading="store.loading"
          data-testid="fetch-btn"
          @click="onFetch"
        >
          Fetch
        </v-btn>
        <v-switch
          v-model="requeue"
          color="primary"
          label="Requeue messages"
          density="compact"
          hide-details
          inset
          style="transform: scale(0.75); transform-origin: left center;"
          data-testid="requeue-toggle"
        >
        </v-switch>
        <v-spacer />
        <span
          v-if="store.lastFetchAt"
          class="text-caption text-medium-emphasis"
          data-testid="last-fetch"
        >
          {{ store.messages.length }} message(s) — fetched at
          {{ store.lastFetchAt.toLocaleTimeString() }}
        </span>
      </div>

      <v-alert
        v-if="!requeue"
        type="warning"
        variant="tonal"
        density="compact"
        class="mb-3"
        data-testid="destructive-warning"
      >
        Destructive mode: messages will be permanently removed from the queue.
      </v-alert>

      <v-alert
        v-if="store.error"
        type="error"
        variant="tonal"
        class="mb-3"
        data-testid="error-alert"
      >
        {{ store.error }}
      </v-alert>

      <v-data-table
        v-model:items-per-page="itemsPerPage"
        :headers="headers"
        :items="rows"
        density="compact"
        hover
        show-expand
        item-value="index"
        :loading="store.loading"
        no-data-text="No messages — click Fetch to read from the broker."
      >
        <template #item.body="{ item }">
          <span v-if="item.decoded.binary" class="text-medium-emphasis">
            <v-chip size="x-small" color="purple" class="mr-2">binary</v-chip>
            <code class="text-caption">{{ truncate(item.decoded.text, 60) }}</code>
          </span>
          <code v-else class="text-caption">{{ truncate(item.decoded.text, 80) }}</code>
        </template>
        <template #item.redelivered="{ item }">
          <v-icon
            :color="item.message.redelivered ? 'orange' : 'grey'"
            size="small"
          >
            {{ item.message.redelivered ? 'mdi-replay' : 'mdi-minus' }}
          </v-icon>
        </template>
        <template #item.payload_bytes="{ item }">
          {{ item.message.payload_bytes }}
          <v-tooltip
            v-if="item.truncated"
            location="top"
            text="Payload truncated server-side"
          >
            <template #activator="{ props: tooltipProps }">
              <v-icon v-bind="tooltipProps" size="x-small" color="orange" class="ml-1">
                mdi-content-cut
              </v-icon>
            </template>
          </v-tooltip>
        </template>
        <template #expanded-row="{ item, columns }">
          <tr>
            <td :colspan="columns.length" class="pa-4 bg-grey-darken-4">
              <div class="text-overline mb-1">Payload</div>
              <v-chip
                v-if="item.decoded.binary"
                color="purple"
                size="x-small"
                class="mb-2"
              >
                binary (base64)
              </v-chip>
              <pre class="text-caption mb-4" style="white-space: pre-wrap; word-break: break-all">{{ item.decoded.text }}</pre>

              <div class="text-overline mb-1">Properties</div>
              <pre class="text-caption mb-4">{{ formatJson(item.message.properties) }}</pre>

              <div class="text-overline mb-1">Headers</div>
              <pre class="text-caption">{{ formatJson(item.message.properties.headers ?? {}) }}</pre>
            </td>
          </tr>
        </template>
      </v-data-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useQueueMessagesStore } from '@/stores/queueMessages'
import { decodePayload, type DecodedPayload } from '@/utils/decodePayload'
import { DEFAULT_GET_TRUNCATE, type PeekedMessage } from '@/services/management'

const props = defineProps<{
  queueName: string
  /** RabbitMQ queue type (`classic` | `quorum` | `stream`). */
  queueType?: string
}>()

const store = useQueueMessagesStore()
const itemsPerPage = ref(10)
const requeue = ref(true)

const isStream = computed(() => props.queueType === 'stream')

interface Row {
  index: number
  message: PeekedMessage
  decoded: DecodedPayload
  truncated: boolean
}

const rows = computed<Row[]>(() =>
  store.messages.map((m, i) => ({
    index: i,
    message: m,
    decoded: decodePayload(m.payload, m.payload_encoding),
    truncated: m.payload_bytes > DEFAULT_GET_TRUNCATE,
  })),
)

const headers = [
  { title: '#', key: 'index', width: 50 },
  { title: 'Body', key: 'body' },
  { title: 'Routing key', key: 'message.routing_key' },
  { title: 'Exchange', key: 'message.exchange' },
  { title: 'Redelivered', key: 'redelivered', width: 110 },
  { title: 'Bytes', key: 'payload_bytes', width: 110 },
]

async function onFetch() {
  await store.fetchMessages(props.queueName, {
    count: itemsPerPage.value,
    requeue: requeue.value,
  })
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s
}

function formatJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
</script>
