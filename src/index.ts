import { Hono } from 'hono'
import { UI_HTML } from './ui'
import { runAgent } from './agent'
import { deployWorker } from './tools/deploy_worker'
import type { Env, ModelProvider } from './types'

// Re-export Sandbox Durable Object for wrangler
export { Sandbox } from '@cloudflare/sandbox'

const app = new Hono<{ Bindings: Env }>()

app.get('/', (c) => c.html(UI_HTML.replace(/\{\{ZONE_NAME\}\}/g, c.env.ZONE_NAME)))

// Pre-warm the sandbox container — call on page load so it's ready by first query
// Warms up Python + matplotlib + fonts so the first execute_code is fast
app.post('/api/warmup', async (c) => {
  const { sessionId } = await c.req.json<{ sessionId: string }>()
  const { getSandbox } = await import('@cloudflare/sandbox')
  const id = sessionId || 'warmup'
  try {
    const sandbox = await getSandbox(c.env.SANDBOX, id)
    await sandbox.runCode(`
import matplotlib
matplotlib.rcParams['font.family'] = 'Noto Sans CJK JP'
import matplotlib.pyplot as plt
import pandas as pd
import numpy as np
print("warm: matplotlib + pandas + numpy ready")
`, { language: 'python' })
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

// Direct deploy endpoint — called from UI after user confirms preview
app.post('/api/deploy', async (c) => {
  const { code, name } = await c.req.json<{ code: string; name: string }>()

  if (!code?.trim() || !name?.trim()) {
    return c.json({ error: 'code and name required' }, 400)
  }

  try {
    const result = await deployWorker({ name, code }, c.env)
    return c.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: message }, 500)
  }
})

export default app
