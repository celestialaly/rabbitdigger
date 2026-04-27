<template>
  <v-dialog
    :model-value="modelValue"
    max-width="520"
    data-testid="create-queue-dialog"
    @update:model-value="(v) => emit('update:modelValue', v)"
  >
    <v-card>
      <v-card-title>Create queue</v-card-title>

      <v-card-text>
        <v-alert
          v-if="error"
          type="error"
          variant="tonal"
          density="compact"
          class="mb-4"
          data-testid="create-queue-error"
        >
          {{ error }}
        </v-alert>

        <v-text-field
          v-model="form.name"
          label="Name"
          density="compact"
          variant="outlined"
          autofocus
          hide-details="auto"
          class="mb-3"
          :error-messages="nameError ? [nameError] : []"
          data-testid="queue-name"
        />

        <v-select
          v-model="form.type"
          :items="typeOptions"
          label="Type"
          density="compact"
          variant="outlined"
          hide-details
          class="mb-3"
          data-testid="queue-type"
        />

        <v-checkbox
          v-model="form.durable"
          label="Durable"
          density="compact"
          hide-details
          :disabled="!isClassic"
          data-testid="queue-durable"
        />

        <v-checkbox
          v-model="form.autoDelete"
          label="Auto-delete"
          density="compact"
          hide-details
          :disabled="!isClassic"
          data-testid="queue-auto-delete"
        />
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn
          variant="text"
          :disabled="submitting"
          data-testid="create-queue-cancel"
          @click="onCancel"
        >
          Cancel
        </v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="submitting"
          :disabled="!isValid || submitting"
          data-testid="create-queue-submit"
          @click="onSubmit"
        >
          Create
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useQueuesStore } from '@/stores/queues'
import type { QueueType } from '@/services/management'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  created: []
}>()

const queuesStore = useQueuesStore()

const typeOptions: { title: string; value: QueueType }[] = [
  { title: 'Classic', value: 'classic' },
  { title: 'Quorum', value: 'quorum' },
  { title: 'Stream', value: 'stream' },
]

interface FormState {
  name: string
  type: QueueType
  durable: boolean
  autoDelete: boolean
}

function defaults(): FormState {
  return { name: '', type: 'classic', durable: true, autoDelete: false }
}

const form = reactive<FormState>(defaults())
const submitting = ref(false)
const error = ref<string | null>(null)

const isClassic = computed(() => form.type === 'classic')

// Reset form whenever the dialog is reopened.
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      Object.assign(form, defaults())
      submitting.value = false
      error.value = null
    }
  },
)

// Quorum and stream queues must be durable and cannot auto-delete (broker
// constraint). Force the toggles into the only allowed combination so the
// payload always matches what the user sees.
watch(
  () => form.type,
  (type) => {
    if (type !== 'classic') {
      form.durable = true
      form.autoDelete = false
    }
  },
)

const nameError = computed(() => {
  const name = form.name.trim()
  if (!name) return ''
  if (name.startsWith('amq.')) return 'Names starting with "amq." are reserved'
  // RabbitMQ limit: 255 bytes (UTF-8). Use TextEncoder for accuracy.
  if (new TextEncoder().encode(name).byteLength > 255)
    return 'Name must be 255 bytes or fewer'
  return ''
})

const isValid = computed(() => {
  const name = form.name.trim()
  return name.length > 0 && !nameError.value
})

function onCancel() {
  emit('update:modelValue', false)
}

async function onSubmit() {
  if (!isValid.value || submitting.value) return
  submitting.value = true
  error.value = null
  try {
    await queuesStore.createQueue({
      name: form.name.trim(),
      type: form.type,
      durable: form.durable,
      auto_delete: form.autoDelete,
    })
    emit('created')
    emit('update:modelValue', false)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to create queue'
  } finally {
    submitting.value = false
  }
}
</script>
