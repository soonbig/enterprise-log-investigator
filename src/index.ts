import { Hono } from 'hono'
import { UI_HTML } from './ui'
import { runAgent } from './agent'
import type { Env, ModelProvider } from './types'

// Re-export Sandbox Durable Object for wrangler
export { Sandbox } from '@cloudflare/sandbox'

const app = new Hono<{ Bindings: Env }>()

app.get('/', (c) => c.html(UI_HTML))

// Pre-warm the sandbox container — call on page load so it's ready by first query
app.get('/api/warmup', async (c) => {
  const { getSandbox } = await import('@cloudflare/sandbox')
  const warmupId = 'warmup'
  try {
    const sandbox = await getSandbox(c.env.SANDBOX, warmupId)
    await sandbox.runCode('print("warm")', { language: 'python' })
    return c.json({ status: 'ready' })
  } catch {
    return c.json({ status: 'starting' }, 202)
  }
})

app.post('/api/chat', async (c) => {
  const { message, sessionId, model } = await c.req.json<{ message: string; sessionId: string; model?: ModelProvider }>()

  if (!message?.trim()) {
    return c.json({ error: 'message required' }, 400)
  }

  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()

  const emit = (event: object) => {
    writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
  }

  // Run agent in background, stream SSE to client
  c.executionCtx.waitUntil(
    runAgent(message, sessionId, c.env, emit, model ?? 'kimi-k2.5').catch((err) => {
      emit({ type: 'error', message: err.message })
    }).finally(() => writer.close()),
  )

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
})

export default app
