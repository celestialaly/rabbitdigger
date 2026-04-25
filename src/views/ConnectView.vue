<template>
  <v-container class="d-flex align-center justify-center" style="min-height: 100vh">
    <v-card width="460" elevation="8">
      <v-card-title class="text-h5 pa-6 pb-2">
        <v-icon class="mr-2" color="orange">mdi-rabbit</v-icon>
        RabbitDigger
      </v-card-title>
      <v-card-subtitle class="px-6 pb-4">Connect to your RabbitMQ cluster</v-card-subtitle>

      <v-card-text>
        <v-alert
          v-if="expired"
          type="warning"
          variant="tonal"
          class="mb-4"
          data-testid="session-expired-alert"
        >
          Session expirée — veuillez vous reconnecter.
        </v-alert>

        <v-form @submit.prevent="handleConnect">
          <v-text-field
            v-model="form.host"
            label="Host"
            placeholder="localhost"
            prepend-inner-icon="mdi-server"
            variant="outlined"
            density="compact"
            class="mb-3"
          />
          <v-row>
            <v-col cols="6">
              <v-text-field
                v-model.number="form.managementPort"
                label="Management port"
                type="number"
                variant="outlined"
                density="compact"
              />
            </v-col>
            <v-col cols="6">
              <v-text-field
                v-model.number="form.stompPort"
                label="STOMP WS port"
                type="number"
                variant="outlined"
                density="compact"
              />
            </v-col>
          </v-row>
          <v-text-field
            v-model="form.vhost"
            label="Virtual host"
            placeholder="/"
            variant="outlined"
            density="compact"
            class="mb-3"
          />
          <v-text-field
            v-model="form.username"
            label="Username"
            prepend-inner-icon="mdi-account"
            variant="outlined"
            density="compact"
            class="mb-3"
          />
          <v-text-field
            v-model="form.password"
            label="Password"
            :type="showPassword ? 'text' : 'password'"
            prepend-inner-icon="mdi-lock"
            :append-inner-icon="showPassword ? 'mdi-eye-off' : 'mdi-eye'"
            @click:append-inner="showPassword = !showPassword"
            variant="outlined"
            density="compact"
            class="mb-3"
          />

          <v-alert v-if="connectionStore.error" type="error" variant="tonal" class="mb-4">
            {{ connectionStore.error }}
          </v-alert>

          <v-btn
            type="submit"
            color="orange"
            block
            :loading="connectionStore.status === 'connecting'"
          >
            Connect
          </v-btn>
        </v-form>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useConnectionStore, INACTIVITY_MS } from '@/stores/connection'

const router = useRouter()
const route = useRoute()
const connectionStore = useConnectionStore()
const showPassword = ref(false)

const expired = computed(() => route.query.expired === '1')

const form = reactive({
  host: connectionStore.host,
  managementPort: connectionStore.managementPort,
  stompPort: connectionStore.stompPort,
  username: connectionStore.username,
  password: connectionStore.password,
  vhost: connectionStore.vhost,
})

async function handleConnect() {
  connectionStore.host = form.host
  connectionStore.managementPort = form.managementPort
  connectionStore.stompPort = form.stompPort
  connectionStore.username = form.username
  connectionStore.password = form.password
  connectionStore.vhost = form.vhost

  await connectionStore.connect()

  if (connectionStore.status === 'connected') {
    const target = pickRedirectTarget()
    router.push(target)
  }
}

function pickRedirectTarget(): string {
  const last = connectionStore.lastRoute
  if (!last || last === '/connect' || last.startsWith('/connect?')) return '/'
  // Only honour a recent route — beyond the inactivity window we treat the
  // saved route as stale and fall back to the dashboard.
  if (Date.now() - connectionStore.lastActivity > INACTIVITY_MS) return '/'
  return last
}
</script>
