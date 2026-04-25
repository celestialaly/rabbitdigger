<template>
  <v-dialog
    :model-value="modelValue"
    max-width="520"
    data-testid="export-csv-dialog"
    @update:model-value="(v) => emit('update:modelValue', v)"
  >
    <v-card>
      <v-card-title>Export messages to CSV</v-card-title>

      <v-card-text>
        <v-alert
          type="info"
          variant="tonal"
          density="compact"
          class="mb-4"
          data-testid="export-info"
        >
          Queue: <strong>{{ queueName }}</strong> —
          {{ messageCount }} message(s) to export
        </v-alert>

        <v-text-field
          v-model="separator"
          label="Separator"
          density="compact"
          variant="outlined"
          maxlength="1"
          hide-details="auto"
          class="mb-3"
          :error-messages="separatorError ? [separatorError] : []"
          data-testid="csv-separator"
        />

        <v-text-field
          v-model="delimiter"
          label="Delimiter (quote character)"
          density="compact"
          variant="outlined"
          maxlength="1"
          hide-details="auto"
          class="mb-3"
          :error-messages="delimiterError ? [delimiterError] : []"
          data-testid="csv-delimiter"
        />

        <v-checkbox
          v-model="includeHeader"
          label="Include header row with column names"
          density="compact"
          hide-details
          data-testid="csv-include-header"
        />
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn
          variant="text"
          data-testid="export-cancel"
          @click="onCancel"
        >
          Cancel
        </v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :disabled="!isValid"
          data-testid="export-confirm"
          @click="onConfirm"
        >
          Export
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  modelValue: boolean
  queueName: string
  messageCount: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: [opts: { separator: string; quote: string; includeHeader: boolean }]
}>()

const separator = ref(',')
const delimiter = ref('"')
const includeHeader = ref(true)

// Reset to defaults whenever the dialog is reopened.
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      separator.value = ','
      delimiter.value = '"'
      includeHeader.value = true
    }
  },
)

const separatorError = computed(() => {
  if (separator.value.length !== 1) return 'Must be exactly 1 character'
  return ''
})

const delimiterError = computed(() => {
  if (delimiter.value.length !== 1) return 'Must be exactly 1 character'
  if (delimiter.value === separator.value) return 'Must differ from separator'
  return ''
})

const isValid = computed(() => !separatorError.value && !delimiterError.value)

function onCancel() {
  emit('update:modelValue', false)
}

function onConfirm() {
  if (!isValid.value) return
  emit('confirm', {
    separator: separator.value,
    quote: delimiter.value,
    includeHeader: includeHeader.value,
  })
  emit('update:modelValue', false)
}
</script>
