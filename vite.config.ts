import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type PluginOption, type ViteDevServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'

/**
 * Dev-only middleware that forwards `/__rabbit/...` calls to whatever broker
 * the client targets via the `X-Rabbit-Target` header (e.g.
 * `http://192.168.1.40:15672`). The browser only ever talks to Vite, so CORS
 * never enters the picture even when the target broker has no CORS config.
 * See ADR 0006.
 *
 * `localhost` / `127.0.0.1` in the target are transparently rewritten to the
 * Docker service name `rabbitmq`, because this proxy runs *inside* the `app`
 * container where `localhost` points to the container itself, not to the host.
 * The browser still sees `localhost` (so the STOMP WebSocket reaches the host),
 * but server-side REST forwarding goes to the actual broker container.
 */
const LOCAL_HOST_REWRITE = process.env.RABBITDIGGER_LOCAL_BROKER_HOST ?? 'rabbitmq'

function rewriteLocalTarget(target: string): string {
  try {
    const u = new URL(target)
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
      u.hostname = LOCAL_HOST_REWRITE
    }
    return u.toString()
  } catch {
    return target
  }
}

function rabbitBrokerProxy(): PluginOption {
  return {
    name: 'rabbitdigger-broker-proxy',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/__rabbit', async (req, res) => {
        const rawTarget = req.headers['x-rabbit-target']
        const targetHeader = Array.isArray(rawTarget) ? rawTarget[0] : rawTarget
        // eslint-disable-next-line no-console
        console.log(`[rabbit-proxy] ${req.method} ${req.url} → target=${targetHeader ?? '<missing>'}`)
        if (!targetHeader) {
          res.statusCode = 400
          res.end('Missing X-Rabbit-Target header')
          return
        }
        const target = rewriteLocalTarget(targetHeader)

        let upstreamUrl: URL
        try {
          upstreamUrl = new URL((req.url ?? '/').replace(/^\//, ''), target.endsWith('/') ? target : target + '/')
        } catch {
          res.statusCode = 400
          res.end('Invalid X-Rabbit-Target value')
          return
        }

        const chunks: Buffer[] = []
        for await (const chunk of req) chunks.push(chunk as Buffer)
        const body = chunks.length ? Buffer.concat(chunks) : undefined

        const forwardHeaders = new Headers()
        for (const [k, v] of Object.entries(req.headers)) {
          if (v == null) continue
          if (['host', 'connection', 'content-length', 'x-rabbit-target'].includes(k.toLowerCase())) continue
          forwardHeaders.set(k, Array.isArray(v) ? v.join(', ') : v)
        }

        try {
          const upstream = await fetch(upstreamUrl, {
            method: req.method ?? 'GET',
            headers: forwardHeaders,
            body: body as BodyInit | undefined,
          })
          res.statusCode = upstream.status
          upstream.headers.forEach((value, key) => {
            // Strip:
            //   - hop-by-hop headers (transfer-encoding, connection)
            //   - CORS headers from upstream (meaningless once proxied)
            //   - content-encoding / content-length: `arrayBuffer()` returns
            //     the already-decoded body, so the upstream values would lie
            //     about both the encoding and the byte length, causing the
            //     browser to either fail gunzip or truncate the response.
            const lower = key.toLowerCase()
            if (
              lower === 'transfer-encoding' ||
              lower === 'connection' ||
              lower === 'content-encoding' ||
              lower === 'content-length' ||
              lower === 'access-control-allow-origin'
            ) return
            res.setHeader(key, value)
          })
          const buf = Buffer.from(await upstream.arrayBuffer())
          res.setHeader('content-length', buf.byteLength)
          // eslint-disable-next-line no-console
          console.log(`[rabbit-proxy]   ← ${upstream.status} (${buf.length}B) from ${upstreamUrl}`)
          res.end(buf)
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(`[rabbit-proxy]   ✗ ${upstreamUrl}: ${(err as Error).message}`)
          res.statusCode = 502
          res.end(`Broker proxy error: ${(err as Error).message}`)
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [
    vue(),
    vuetify({ autoImport: true }),
    rabbitBrokerProxy(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
  },
})
