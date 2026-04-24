/**
 * Integration test: talks to the REAL RabbitMQ broker started by `docker compose`.
 *
 * Pre-requisite: `docker compose up -d` so the `rabbitmq` service is healthy.
 * This test runs inside the `app` container (`drd yarn test:run`), where the
 * broker is reachable via the Docker DNS name `rabbitmq` on port 15674
 * (rabbitmq_web_stomp plugin, default endpoint `/ws`).
 *
 * Goal: reproduce the "WebSocket connection failed" bug at the service layer,
 * without going through Playwright. While the bug is present this test is RED;
 * once `connectStomp` is fixed it must turn green.
 *
 * @vitest-environment node
 */
import { describe, it, expect, afterEach } from 'vitest'
import { connectStomp, disconnectStomp, stompStatus, stompError } from './stomp'

const HOST = process.env.RABBITMQ_HOST ?? 'rabbitmq'
const PORT = Number(process.env.RABBITMQ_STOMP_PORT ?? 15674)

describe('stomp service ↔ real RabbitMQ', () => {
  afterEach(() => {
    disconnectStomp()
    stompStatus.value = 'disconnected'
    stompError.value = null
  })

  it(
    'connects to the real broker with default guest credentials',
    async () => {
      await expect(connectStomp(HOST, PORT, 'guest', 'guest', '/')).resolves.toBeUndefined()
      expect(stompStatus.value).toBe('connected')
      expect(stompError.value).toBeNull()
    },
    15_000,
  )
})
