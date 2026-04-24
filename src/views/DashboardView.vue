<template>
  <v-container fluid class="pa-6">
    <div class="text-h5 mb-6">Dashboard</div>

    <v-row v-if="store.overview">
      <v-col cols="12" sm="6" md="3">
        <StatCard icon="mdi-tray-full" color="blue" label="Queues" :value="store.overview.object_totals?.queues ?? 0" />
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <StatCard icon="mdi-account-multiple" color="green" label="Consumers" :value="store.overview.object_totals?.consumers ?? 0" />
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <StatCard icon="mdi-message-text" color="orange" label="Messages ready" :value="store.overview.queue_totals?.messages_ready ?? 0" />
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <StatCard icon="mdi-clock-outline" color="red" label="Unacknowledged" :value="store.overview.queue_totals?.messages_unacknowledged ?? 0" />
      </v-col>
    </v-row>

    <v-row class="mt-4" v-if="store.overview">
      <v-col cols="12" md="6">
        <v-card>
          <v-card-title>Cluster</v-card-title>
          <v-card-text>
            <div class="text-body-2 mb-1">
              <strong>Name:</strong> {{ store.overview.cluster_name }}
            </div>
            <div class="text-body-2 mb-1">
              <strong>RabbitMQ version:</strong> {{ store.overview.rabbitmq_version }}
            </div>
            <div class="text-body-2 mb-1">
              <strong>Connections:</strong> {{ store.overview.object_totals?.connections }}
            </div>
            <div class="text-body-2">
              <strong>Channels:</strong> {{ store.overview.object_totals?.channels }}
            </div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" md="6">
        <v-card>
          <v-card-title>Message rates (msg/s)</v-card-title>
          <v-card-text>
            <div class="text-body-2 mb-1">
              <strong>Publish:</strong>
              {{ store.overview.message_stats?.publish_details?.rate?.toFixed(1) ?? 0 }}
            </div>
            <div class="text-body-2">
              <strong>Deliver/get:</strong>
              {{ store.overview.message_stats?.deliver_get_details?.rate?.toFixed(1) ?? 0 }}
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-progress-circular v-else indeterminate color="orange" class="mt-8 d-flex mx-auto" />
  </v-container>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useQueuesStore } from '@/stores/queues'
import StatCard from '@/components/StatCard.vue'

const store = useQueuesStore()

store.refreshOverview()
const interval = setInterval(() => store.refreshOverview(), 5000)
onUnmounted(() => clearInterval(interval))
</script>
