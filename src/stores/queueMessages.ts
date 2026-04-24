import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  management,
  type GetMessagesAckMode,
  type PeekedMessage,
} from '@/services/management'

export interface FetchMessagesArgs {
  /** Number of messages requested from the broker. */
  count: number
  /** When true, messages are requeued (non-destructive read). */
  requeue: boolean
}

export const useQueueMessagesStore = defineStore('queueMessages', () => {
  const messages = ref<PeekedMessage[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const lastFetchAt = ref<Date | null>(null)
  const lastQueue = ref<string | null>(null)

  async function fetchMessages(queueName: string, args: FetchMessagesArgs) {
    loading.value = true
    error.value = null
    const ackmode: GetMessagesAckMode = args.requeue
      ? 'ack_requeue_true'
      : 'ack_requeue_false'
    try {
      messages.value = await management.getQueueMessages(queueName, {
        count: args.count,
        ackmode,
      })
      lastFetchAt.value = new Date()
      lastQueue.value = queueName
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch messages'
    } finally {
      loading.value = false
    }
  }

  function clear() {
    messages.value = []
    error.value = null
    lastFetchAt.value = null
    lastQueue.value = null
  }

  return { messages, loading, error, lastFetchAt, lastQueue, fetchMessages, clear }
})
