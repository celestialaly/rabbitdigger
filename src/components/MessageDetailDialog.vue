<template>
  <v-dialog
    :model-value="modelValue"
    max-width="900"
    scrollable
    data-testid="message-detail-dialog"
    @update:model-value="(v) => emit('update:modelValue', v)"
  >
    <v-card v-if="message">
      <v-card-title class="d-flex align-center">
        <span>Message details</span>
        <v-chip
          v-if="decoded.binary"
          color="purple"
          size="small"
          class="ml-3"
        >
          binary (base64)
        </v-chip>
        <v-spacer />
        <v-btn
          icon="mdi-content-copy"
          variant="text"
          size="small"
          :title="copied ? 'Copied!' : 'Copy body to clipboard'"
          data-testid="message-detail-copy"
          @click="onCopy"
        />
        <v-btn
          icon="mdi-close"
          variant="text"
          size="small"
          data-testid="message-detail-close-icon"
          @click="emit('update:modelValue', false)"
        />
      </v-card-title>

      <v-divider />

      <v-card-text style="max-height: 70vh">
        <div class="text-overline mb-2">Summary</div>
        <v-table density="compact" class="mb-4" data-testid="message-detail-summary">
          <tbody>
            <tr v-for="row in summaryRows" :key="row.label">
              <td class="text-medium-emphasis" style="width: 200px">{{ row.label }}</td>
              <td><code class="text-caption">{{ row.value }}</code></td>
            </tr>
          </tbody>
        </v-table>

        <div class="text-overline mb-2">
          Body
          <span class="text-caption text-medium-emphasis ml-2">
            ({{ message.payload_bytes }} byte(s){{
              truncated ? ', truncated server-side' : ''
            }})
          </span>
        </div>
        <pre
          class="text-caption pa-3 rounded mb-4 message-detail-body"
          data-testid="message-detail-body"
        >{{ decoded.text }}</pre>

        <div class="text-overline mb-2">Properties</div>
        <pre
          class="text-caption pa-3 rounded mb-4 message-detail-block"
          data-testid="message-detail-properties"
        >{{ formatJson(propertiesWithoutHeaders) }}</pre>

        <div class="text-overline mb-2">Headers</div>
        <pre
          class="text-caption pa-3 rounded message-detail-block"
          data-testid="message-detail-headers"
        >{{ formatJson(message.properties.headers ?? {}) }}</pre>
      </v-card-text>

      <v-divider />

      <v-card-actions>
        <v-spacer />
        <v-btn
          variant="text"
          data-testid="message-detail-close"
          @click="emit('update:modelValue', false)"
        >
          Close
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { decodePayload } from '@/utils/decodePayload'
import { DEFAULT_GET_TRUNCATE, type PeekedMessage } from '@/services/management'

const props = defineProps<{
  modelValue: boolean
  message: PeekedMessage | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const copied = ref(false)

// Reset the transient "copied" indicator each time the dialog reopens.
watch(
  () => props.modelValue,
  (open) => {
    if (open) copied.value = false
  },
)

const decoded = computed(() => {
  if (!props.message) return { text: '', binary: false }
  return decodePayload(props.message.payload, props.message.payload_encoding)
})

const truncated = computed(
  () => !!props.message && props.message.payload_bytes > DEFAULT_GET_TRUNCATE,
)

const summaryRows = computed(() => {
  const m = props.message
  if (!m) return []
  return [
    { label: 'Message ID', value: m.properties.message_id ?? '—' },
    { label: 'Routing key', value: m.routing_key || '—' },
    { label: 'Exchange', value: m.exchange || '(default)' },
    { label: 'Encoding', value: m.payload_encoding },
    { label: 'Bytes', value: String(m.payload_bytes) },
    { label: 'Redelivered', value: m.redelivered ? 'yes' : 'no' },
  ]
})

/** Properties without the `headers` field, which has its own dedicated block. */
const propertiesWithoutHeaders = computed(() => {
  if (!props.message) return {}
  const { headers: _headers, ...rest } = props.message.properties
  return rest
})

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

async function onCopy() {
  if (!props.message) return
  try {
    await navigator.clipboard.writeText(decoded.value.text)
    copied.value = true
  } catch {
    copied.value = false
  }
}
</script>

<style scoped>
.message-detail-body,
.message-detail-block {
  background-color: rgb(var(--v-theme-surface-variant, 38, 50, 56));
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 40vh;
  overflow: auto;
}
</style>
