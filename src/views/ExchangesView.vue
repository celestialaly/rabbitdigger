<template>
  <v-container fluid class="pa-6">
    <div class="d-flex align-center mb-4">
      <div class="text-h5">Exchanges</div>
      <v-spacer />
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
      <v-btn icon="mdi-refresh" variant="text" :loading="store.loading" @click="store.refreshExchanges()" />
    </div>

    <v-data-table
      :headers="headers"
      :items="filtered"
      :loading="store.loading"
      density="compact"
      hover
    >
      <template #item.type="{ item }">
        <v-chip size="x-small" color="blue">{{ item.type }}</v-chip>
      </template>
      <template #item.durable="{ item }">
        <v-icon :color="item.durable ? 'green' : 'grey'" size="small">
          {{ item.durable ? 'mdi-check' : 'mdi-close' }}
        </v-icon>
      </template>
      <template #item.internal="{ item }">
        <v-icon :color="item.internal ? 'orange' : 'grey'" size="small">
          {{ item.internal ? 'mdi-check' : 'mdi-close' }}
        </v-icon>
      </template>
    </v-data-table>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useQueuesStore } from '@/stores/queues'

const store = useQueuesStore()
const search = ref('')

const headers = [
  { title: 'Name', key: 'name' },
  { title: 'VHost', key: 'vhost' },
  { title: 'Type', key: 'type' },
  { title: 'Durable', key: 'durable' },
  { title: 'Auto-delete', key: 'auto_delete' },
  { title: 'Internal', key: 'internal' },
]

const filtered = computed(() =>
  store.exchanges.filter((e) =>
    e.name.toLowerCase().includes(search.value.toLowerCase()),
  ),
)

onMounted(() => store.refreshExchanges())
</script>
