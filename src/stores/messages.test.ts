import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useMessagesStore, type ConsumedMessage } from './messages'

function makeMsg(id: string): ConsumedMessage {
  return {
    id,
    queue: 'q',
    body: '',
    headers: {},
    timestamp: new Date(),
    ack: () => {},
    nack: () => {},
  }
}

describe('messages store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('prepends new messages (most recent first)', () => {
    const store = useMessagesStore()
    store.addMessage(makeMsg('a'))
    store.addMessage(makeMsg('b'))
    expect(store.messages.map((m) => m.id)).toEqual(['b', 'a'])
  })

  it('caps the buffer at 200 messages', () => {
    const store = useMessagesStore()
    for (let i = 0; i < 250; i++) store.addMessage(makeMsg(String(i)))
    expect(store.messages).toHaveLength(200)
    expect(store.messages[0].id).toBe('249')
  })

  it('clearMessages empties the buffer', () => {
    const store = useMessagesStore()
    store.addMessage(makeMsg('a'))
    store.clearMessages()
    expect(store.messages).toEqual([])
  })
})
