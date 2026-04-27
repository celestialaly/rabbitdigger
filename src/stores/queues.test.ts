import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useQueuesStore } from './queues'
import { management, type CreateQueueInput, type RabbitQueue } from '@/services/management'

vi.mock('@/services/management', () => ({
  management: {
    getQueues: vi.fn(),
    getExchanges: vi.fn(),
    getOverview: vi.fn(),
    createQueue: vi.fn(),
  },
}))

const mockedManagement = management as unknown as {
  getQueues: ReturnType<typeof vi.fn>
  createQueue: ReturnType<typeof vi.fn>
}

describe('queues store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('createQueue', () => {
    const input: CreateQueueInput = {
      name: 'orders',
      type: 'classic',
      durable: true,
      auto_delete: false,
    }

    it('calls management.createQueue with the input then refreshes the queue list', async () => {
      const refreshed: RabbitQueue[] = [
        {
          name: 'orders',
          vhost: '/',
          durable: true,
          auto_delete: false,
          messages: 0,
          messages_ready: 0,
          messages_unacknowledged: 0,
          consumers: 0,
          state: 'running',
          type: 'classic',
        },
      ]
      mockedManagement.createQueue.mockResolvedValueOnce(undefined)
      mockedManagement.getQueues.mockResolvedValueOnce(refreshed)

      const store = useQueuesStore()
      await store.createQueue(input)

      expect(mockedManagement.createQueue).toHaveBeenCalledWith(input)
      expect(mockedManagement.getQueues).toHaveBeenCalledTimes(1)
      expect(store.queues).toEqual(refreshed)
    })

    it('propagates the service error and does not refresh', async () => {
      mockedManagement.createQueue.mockRejectedValueOnce(new Error('HTTP 406: bad'))
      const store = useQueuesStore()

      await expect(store.createQueue(input)).rejects.toThrow('HTTP 406: bad')
      expect(mockedManagement.getQueues).not.toHaveBeenCalled()
    })
  })
})
