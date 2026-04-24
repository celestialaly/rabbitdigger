<template>
  <v-container fluid class="pa-6" style="max-width: 800px">
    <div class="text-h5 mb-6">Publish Message</div>

    <v-form @submit.prevent="handlePublish">
      <v-row>
        <v-col cols="8">
          <v-text-field
            v-model="form.exchange"
            label="Exchange"
            placeholder="amq.direct"
            variant="outlined"
            density="compact"
          />
        </v-col>
        <v-col cols="4">
          <v-text-field
            v-model="form.routingKey"
            label="Routing key"
            variant="outlined"
            density="compact"
          />
        </v-col>
      </v-row>

      <v-textarea
        v-model="form.body"
        label="Message body"
        placeholder='{"key": "value"}'
        variant="outlined"
        rows="6"
        class="mb-4"
        monospace
      />

      <div class="text-subtitle-2 mb-2">Headers (optional)</div>
      <div v-for="(header, index) in form.headers" :key="index" class="d-flex ga-2 mb-2">
        <v-text-field
          v-model="header.key"
          label="Key"
          variant="outlined"
          density="compact"
          hide-details
        />
        <v-text-field
          v-model="header.value"
          label="Value"
          variant="outlined"
          density="compact"
          hide-details
        />
        <v-btn icon="mdi-delete" variant="text" color="red" @click="form.headers.splice(index, 1)" />
      </div>
      <v-btn
        variant="text"
        prepend-icon="mdi-plus"
        size="small"
        class="mb-4"
        @click="form.headers.push({ key: '', value: '' })"
      >
        Add header
      </v-btn>

      <v-alert v-if="result" :type="result.type" variant="tonal" class="mb-4">
        {{ result.message }}
      </v-alert>

      <v-btn type="submit" color="orange" :loading="loading" prepend-icon="mdi-send">
        Publish
      </v-btn>
    </v-form>
  </v-container>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { management } from '@/services/management'

const loading = ref(false)
const result = ref<{ type: 'success' | 'error'; message: string } | null>(null)

const form = reactive({
  exchange: '',
  routingKey: '',
  body: '',
  headers: [] as { key: string; value: string }[],
})

async function handlePublish() {
  loading.value = true
  result.value = null
  try {
    const headers = Object.fromEntries(form.headers.map((h) => [h.key, h.value]))
    const res = await management.publishMessage(form.exchange, form.routingKey, form.body, headers)
    result.value = {
      type: res.routed ? 'success' : 'error',
      message: res.routed ? 'Message published and routed.' : 'Message published but not routed to any queue.',
    }
  } catch (e) {
    result.value = { type: 'error', message: e instanceof Error ? e.message : 'Publish failed' }
  } finally {
    loading.value = false
  }
}
</script>
