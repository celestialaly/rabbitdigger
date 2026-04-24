import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface ConsumedMessage {
  id: string
  queue: string
  body: string
  headers: Record<string, unknown>
  timestamp: Date
  ack: () => void
  nack: () => void
}

const MAX_MESSAGES = 200

export const useMessagesStore = defineStore('messages', () => {
  const messages = ref<ConsumedMessage[]>([])

  function addMessage(msg: ConsumedMessage) {
    messages.value.unshift(msg)
    if (messages.value.length > MAX_MESSAGES) {
      messages.value.splice(MAX_MESSAGES)
    }
  }

  function clearMessages() {
    messages.value = []
  }

  return { messages, addMessage, clearMessages }
})
