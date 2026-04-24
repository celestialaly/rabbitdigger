import { defineStore } from 'pinia'
import { ref } from 'vue'
import { management, type RabbitQueue, type RabbitExchange, type RabbitOverview } from '@/services/management'

export const useQueuesStore = defineStore('queues', () => {
  const queues = ref<RabbitQueue[]>([])
  const exchanges = ref<RabbitExchange[]>([])
  const overview = ref<RabbitOverview | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function refreshQueues() {
    loading.value = true
    error.value = null
    try {
      queues.value = await management.getQueues()
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load queues'
    } finally {
      loading.value = false
    }
  }

  async function refreshExchanges() {
    loading.value = true
    error.value = null
    try {
      exchanges.value = await management.getExchanges()
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load exchanges'
    } finally {
      loading.value = false
    }
  }

  async function refreshOverview() {
    try {
      overview.value = await management.getOverview()
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load overview'
    }
  }

  return { queues, exchanges, overview, loading, error, refreshQueues, refreshExchanges, refreshOverview }
})
