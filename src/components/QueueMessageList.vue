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
        <v-btn
          variant="outlined"
          prepend-icon="mdi-file-export"
          :disabled="filteredRows.length === 0"
          data-testid="export-btn"
          @click="exportDialogOpen = true"
        >
          Export CSV
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
          {{ filteredRows.length }} / {{ store.messages.length }} message(s) — fetched at
          {{ store.lastFetchAt.toLocaleTimeString() }}
        </span>
      </div>

      <v-text-field
        v-model="filterText"
        prepend-inner-icon="mdi-filter-variant"
        label="Filter messages (body, routing key, exchange)"
        density="compact"
        variant="outlined"
        hide-details
        clearable
        class="mb-3"
        :disabled="store.messages.length === 0"
        data-testid="filter-input"
      />

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
        :items="filteredRows"
        density="compact"
        hover
        show-expand
        item-value="index"
        :loading="store.loading"
        :no-data-text="noDataText"
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

      <ExportCsvDialog
        v-model="exportDialogOpen"
        :queue-name="props.queueName"
        :message-count="filteredRows.length"
        @confirm="onExport"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useQueueMessagesStore } from '@/stores/queueMessages'
import { decodePayload, type DecodedPayload } from '@/utils/decodePayload'
import { DEFAULT_GET_TRUNCATE, type PeekedMessage } from '@/services/management'
import { toCsv } from '@/utils/csv'
import ExportCsvDialog from '@/components/ExportCsvDialog.vue'

const props = defineProps<{
  queueName: string
  /** RabbitMQ queue type (`classic` | `quorum` | `stream`). */
  queueType?: string
}>()

const store = useQueueMessagesStore()
const itemsPerPage = ref(10)
const requeue = ref(true)
const filterText = ref('')
const exportDialogOpen = ref(false)

const CSV_COLUMNS = [
  'id',
  'size',
  'body',
  'routing key',
  'source queue',
  'source exchange',
] as const

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

const filteredRows = computed<Row[]>(() => {
  const needle = filterText.value?.trim().toLowerCase() ?? ''
  if (!needle) return rows.value
  return rows.value.filter((row) => {
    const haystack = [
      row.decoded.text,
      row.message.routing_key,
      row.message.exchange,
    ]
      .join(' ')
      .toLowerCase()
    return haystack.includes(needle)
  })
})

const noDataText = computed(() =>
  store.messages.length === 0
    ? 'No messages — click Fetch to read from the broker.'
    : 'No messages match the current filter.',
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

function onExport(opts: { separator: string; quote: string; includeHeader: boolean }) {
  const data = filteredRows.value.map((row) => [
    row.message.properties.message_id ?? '',
    String(row.message.payload_bytes),
    row.message.payload,
    row.message.routing_key,
    props.queueName,
    row.message.exchange,
  ])
  const csv = toCsv(data, {
    separator: opts.separator,
    quote: opts.quote,
    header: opts.includeHeader ? CSV_COLUMNS : undefined,
  })
  downloadCsv(csv, buildFilename(props.queueName))
}

function buildFilename(queueName: string): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  const safe = queueName.replace(/[^a-zA-Z0-9._-]+/g, '_') || 'queue'
  return `messages-${safe}-${stamp}.csv`
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
</script>
