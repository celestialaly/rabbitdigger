<template>
  <v-card variant="outlined" data-testid="import-csv-panel">
    <v-card-text>
      <!-- Step 1: Pick a file + tweak parsing -->
      <v-file-input
        v-model="file"
        label="CSV file"
        accept=".csv,text/csv"
        prepend-icon="mdi-file-import"
        density="compact"
        variant="outlined"
        show-size
        :disabled="progress.running"
        data-testid="import-file"
      />

      <div class="d-flex ga-3">
        <v-text-field
          v-model="separator"
          label="Separator"
          density="compact"
          variant="outlined"
          maxlength="1"
          hide-details="auto"
          :error-messages="separatorError ? [separatorError] : []"
          :disabled="progress.running"
          data-testid="import-separator"
          style="max-width: 220px"
        />
        <v-text-field
          v-model="delimiter"
          label="Delimiter (quote character)"
          density="compact"
          variant="outlined"
          maxlength="1"
          hide-details="auto"
          :error-messages="delimiterError ? [delimiterError] : []"
          :disabled="progress.running"
          data-testid="import-delimiter"
          style="max-width: 320px"
        />
      </div>

      <!-- Parse error: malformed CSV -->
      <v-alert
        v-if="parseError"
        type="error"
        variant="tonal"
        density="compact"
        class="mt-4"
        data-testid="import-parse-error"
      >
        {{ parseError }}
      </v-alert>

      <!-- Step 2: Preview + validation -->
      <template v-if="validation && !parseError">
        <v-alert
          type="info"
          variant="tonal"
          density="compact"
          class="mt-4"
          data-testid="import-info"
        >
          {{ validation.rows.length }} message(s) to import to queue
          <strong>{{ queueName }}</strong>
          <template v-if="validation.hasHeader"> (header row detected)</template>
        </v-alert>

        <v-alert
          v-if="validation.errors.length > 0"
          type="error"
          variant="tonal"
          density="compact"
          class="mt-3"
          data-testid="import-validation"
        >
          <div class="font-weight-medium mb-1">
            {{ validation.errors.length }} invalid row(s) — fix the file before importing:
          </div>
          <ul class="ml-4">
            <li v-for="err in shownErrors" :key="err.line">
              line {{ err.line }}: {{ err.reason }}
            </li>
            <li v-if="validation.errors.length > shownErrors.length">
              … and {{ validation.errors.length - shownErrors.length }} more
            </li>
          </ul>
        </v-alert>

        <v-table
          v-if="previewRows.length > 0"
          density="compact"
          class="mt-3"
          data-testid="import-preview-table"
        >
          <thead>
            <tr>
              <th>id</th>
              <th>encoding</th>
              <th>body (truncated)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in previewRows" :key="row.line">
              <td>{{ row.id || '—' }}</td>
              <td>{{ row.payloadEncoding }}</td>
              <td>
                <code>{{ truncate(row.body, 80) }}</code>
              </td>
            </tr>
          </tbody>
        </v-table>
      </template>

      <!-- Step 3: Publishing progress -->
      <div v-if="progress.total > 0" class="mt-4" data-testid="import-progress">
        <div class="d-flex align-center mb-1">
          <span class="text-body-2 mr-2">
            {{ progress.sent }} / {{ progress.total }}
            <template v-if="progress.failed > 0">
              ({{ progress.failed }} failed)
            </template>
            <template v-if="progress.canceled"> — canceled</template>
          </span>
        </div>
        <v-progress-linear
          :model-value="(progress.sent / progress.total) * 100"
          :color="progress.failed > 0 ? 'warning' : 'primary'"
          height="8"
        />
      </div>

      <!-- Final summary alert when a publish finished -->
      <v-alert
        v-if="lastResult && !progress.running"
        :type="lastResult.failed > 0 ? 'warning' : 'success'"
        variant="tonal"
        density="compact"
        class="mt-3"
        data-testid="import-result"
      >
        Published {{ lastResult.published }} message(s).
        <template v-if="lastResult.failed > 0">
          {{ lastResult.failed }} failed.
        </template>
        <template v-if="lastResult.canceled">
          Canceled — {{ lastResult.remaining }} message(s) not sent.
        </template>
      </v-alert>
    </v-card-text>

    <v-card-actions>
      <v-spacer />
      <v-btn
        v-if="progress.running"
        variant="text"
        color="warning"
        data-testid="import-cancel"
        @click="onCancel"
      >
        Cancel
      </v-btn>
      <v-btn
        color="primary"
        variant="flat"
        :disabled="!canImport"
        :loading="progress.running"
        data-testid="import-confirm"
        @click="onImport"
      >
        Import
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { management } from '@/services/management'
import {
  CsvParseError,
  parseCsv,
  validateAndMapRows,
  type ImportRow,
  type ValidationResult,
} from '@/utils/csvImport'

const props = defineProps<{ queueName: string }>()

const emit = defineEmits<{
  imported: [result: { published: number; failed: number; canceled: boolean }]
}>()

const PUBLISH_CONCURRENCY = 10
const MAX_PREVIEW_ROWS = 5
const MAX_VALIDATION_ERRORS_SHOWN = 10

const file = ref<File | null>(null)
const separator = ref(',')
const delimiter = ref('"')
const fileText = ref<string | null>(null)

const progress = reactive({
  sent: 0,
  failed: 0,
  total: 0,
  running: false,
  canceled: false,
})
const lastResult = ref<{
  published: number
  failed: number
  canceled: boolean
  remaining: number
} | null>(null)

const cancelRequested = ref(false)

const separatorError = computed(() => {
  if (separator.value.length !== 1) return 'Must be exactly 1 character'
  return ''
})
const delimiterError = computed(() => {
  if (delimiter.value.length !== 1) return 'Must be exactly 1 character'
  if (delimiter.value === separator.value) return 'Must differ from separator'
  return ''
})

// Read the picked file as text. v-file-input gives us either a File or null.
watch(file, async (next) => {
  lastResult.value = null
  if (!next) {
    fileText.value = null
    return
  }
  fileText.value = await next.text()
})

const parsed = computed<{ rows: string[][] | null; error: string | null }>(() => {
  if (!fileText.value) return { rows: null, error: null }
  if (separatorError.value || delimiterError.value) {
    return { rows: null, error: null }
  }
  try {
    const rows = parseCsv(fileText.value, {
      separator: separator.value,
      quote: delimiter.value,
    })
    return { rows, error: null }
  } catch (e) {
    const msg =
      e instanceof CsvParseError
        ? e.message
        : e instanceof Error
          ? e.message
          : 'Failed to parse CSV'
    return { rows: null, error: msg }
  }
})

const parseError = computed(() => parsed.value.error)

const validation = computed<ValidationResult | null>(() => {
  const rows = parsed.value.rows
  if (!rows) return null
  return validateAndMapRows(rows)
})

const previewRows = computed<ImportRow[]>(() =>
  (validation.value?.rows ?? []).slice(0, MAX_PREVIEW_ROWS),
)

const shownErrors = computed(() =>
  (validation.value?.errors ?? []).slice(0, MAX_VALIDATION_ERRORS_SHOWN),
)

const canImport = computed(() => {
  if (progress.running) return false
  const v = validation.value
  if (!v) return false
  if (v.errors.length > 0) return false
  if (v.rows.length === 0) return false
  return true
})

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max) + '…'
}

function onCancel() {
  cancelRequested.value = true
}

async function onImport() {
  if (!canImport.value) return
  const rows = validation.value!.rows
  progress.sent = 0
  progress.failed = 0
  progress.total = rows.length
  progress.running = true
  progress.canceled = false
  cancelRequested.value = false
  lastResult.value = null

  // Concurrency-bounded publisher: we keep at most PUBLISH_CONCURRENCY
  // in-flight requests. Each worker pulls the next row by index until the
  // queue is exhausted or a cancel is requested.
  let cursor = 0
  async function worker(): Promise<void> {
    while (cursor < rows.length && !cancelRequested.value) {
      const idx = cursor
      cursor += 1
      const row = rows[idx]
      try {
        await management.publishMessage('', props.queueName, row.body, {
          payloadEncoding: row.payloadEncoding,
          properties: row.id ? { message_id: row.id } : undefined,
        })
      } catch {
        progress.failed += 1
      }
      progress.sent += 1
    }
  }

  const workerCount = Math.min(PUBLISH_CONCURRENCY, rows.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))

  progress.running = false
  progress.canceled = cancelRequested.value
  const published = progress.sent - progress.failed
  const remaining = progress.total - progress.sent
  lastResult.value = {
    published,
    failed: progress.failed,
    canceled: progress.canceled,
    remaining,
  }
  emit('imported', {
    published,
    failed: progress.failed,
    canceled: progress.canceled,
  })
}

function reset() {
  file.value = null
  fileText.value = null
  separator.value = ','
  delimiter.value = '"'
  progress.sent = 0
  progress.failed = 0
  progress.total = 0
  progress.running = false
  progress.canceled = false
  cancelRequested.value = false
  lastResult.value = null
}

defineExpose({ reset })
</script>
