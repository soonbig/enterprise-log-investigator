import Anthropic from '@anthropic-ai/sdk'
import { fetchLogs } from './tools/fetch_logs'
import { executeCode } from './tools/execute_code'
import { deployWorker, buildReportWorker } from './tools/deploy_worker'
import type { Env, AgentEvent, ModelProvider } from './types'

const getSystemPrompt = () => `You are an enterprise security analyst AI for the soonchang.me domain on Cloudflare.

The current UTC date and time is: ${new Date().toISOString()}
Always use this as the basis for time ranges. Never guess dates.

You have three tools:
1. fetch_logs — Query Cloudflare Analytics GraphQL for HTTP request data and firewall events
2. execute_code — Run Python in a sandbox (numpy, pandas, scipy, matplotlib available). Always save charts with plt.savefig() and use base64 output.
3. deploy_worker — Deploy the analysis results as a live Cloudflare Worker endpoint

When analyzing logs:
- First fetch the relevant time range
- Write Python code to detect anomalies (use z-score: flag anything > 2.5σ)
- Generate a matplotlib chart showing traffic over time with anomalies highlighted in red
- Always deploy the final report as a Worker so the user has a persistent URL

For Python charts, always end with:
\`\`\`python
import base64, io
buf = io.BytesIO()
plt.savefig(buf, format='png', dpi=150, bbox_inches='tight', facecolor='#0f172a')
buf.seek(0)
print("CHART:" + base64.b64encode(buf.read()).decode())
\`\`\`

Respond in the same language the user uses. Be concise and specific about what you find.`

// Tool definitions in OpenAI-compatible format (used by Workers AI / Kimi K2.5)
const TOOLS_OPENAI = [
  {
    type: 'function' as const,
    function: {
      name: 'fetch_logs',
      description:
        'Fetch HTTP request metrics and firewall events from Cloudflare Analytics GraphQL for soonchang.me. Returns hourly request counts, threat counts, unique visitors, and firewall events with client IPs and rule IDs.',
      parameters: {
        type: 'object',
        properties: {
          start_time: {
            type: 'string',
            description: 'Start time in ISO 8601 format (e.g. "2026-04-01T21:00:00Z")',
          },
          end_time: {
            type: 'string',
            description: 'End time in ISO 8601 format (e.g. "2026-04-02T06:00:00Z")',
          },
        },
        required: ['start_time', 'end_time'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'execute_code',
      description:
        'Execute Python code in a secure Cloudflare Sandbox. numpy, pandas, scipy, matplotlib are available. Use this to analyze log data, detect anomalies, and generate charts. Print "CHART:<base64>" to return chart images.',
      parameters: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: 'Python code to execute',
          },
        },
        required: ['code'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'deploy_worker',
      description:
        'Deploy the analysis report as a live Cloudflare Worker with a public URL. Call this after generating the analysis to give the user a persistent report endpoint.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Worker name slug (e.g. "log-report-2026-04-03")',
          },
          title: {
            type: 'string',
            description: 'Report title',
          },
          summary: {
            type: 'string',
            description: 'Human-readable summary of findings',
          },
          anomalies: {
            type: 'array',
            description: 'List of detected anomalies',
            items: {
              type: 'object',
              properties: {
                time: { type: 'string' },
                requests: { type: 'number' },
                zscore: { type: 'number' },
              },
              required: ['time', 'requests', 'zscore'],
            },
          },
          chart_base64: {
            type: 'string',
            description: 'Base64-encoded PNG chart from execute_code',
          },
        },
        required: ['name', 'title', 'summary', 'anomalies'],
      },
    },
  },
]

// Anthropic format tools (converted from OpenAI format)
const TOOLS_ANTHROPIC: Anthropic.Tool[] = TOOLS_OPENAI.map((t) => ({
  name: t.function.name,
  description: t.function.description,
  input_schema: t.function.parameters as Anthropic.Tool['input_schema'],
}))

// ── Tool execution (shared by both providers) ──

interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

async function executeTool(
  tool: ToolCall,
  env: Env,
  sessionId: string,
  emit: (event: AgentEvent) => void,
): Promise<{ result: unknown }> {
  emit({ type: 'tool_start', name: tool.name, input: tool.arguments })

  let result: unknown
  try {
    if (tool.name === 'fetch_logs') {
      const input = tool.arguments as { start_time: string; end_time: string }
      result = await fetchLogs(input, env)
    } else if (tool.name === 'execute_code') {
      const input = tool.arguments as { code: string }
      const codeResult = await executeCode(input, env, sessionId)

      // Emit chart to UI via SSE
      let chartGenerated = false
      if (codeResult.chart) {
        emit({ type: 'chart', base64: codeResult.chart })
        chartGenerated = true
      } else if (codeResult.output?.includes('CHART:')) {
        const match = codeResult.output.match(/CHART:([A-Za-z0-9+/=]+)/)
        if (match) {
          emit({ type: 'chart', base64: match[1] })
          chartGenerated = true
        }
      }

      // Strip chart data and CHART: prefix from LLM result — it's already sent to UI
      const cleanOutput = (codeResult.output ?? '').replace(/CHART:[A-Za-z0-9+/=\n]+/g, '').trim()
      result = {
        success: codeResult.success,
        output: cleanOutput.substring(0, 2000),
        error: codeResult.error,
        chartGenerated,
      }
    } else if (tool.name === 'deploy_worker') {
      const input = tool.arguments as {
        name: string
        title: string
        summary: string
        anomalies: Array<{ time: string; requests: number; zscore: number }>
        chart_base64?: string
      }
      const workerCode = buildReportWorker({
        title: input.title,
        summary: input.summary,
        anomalies: input.anomalies,
        chartBase64: input.chart_base64,
      })
      const deployed = await deployWorker({ name: input.name, code: workerCode }, env)
      result = deployed
      emit({ type: 'deploy', url: deployed.url, workerName: deployed.name })
    }
  } catch (err) {
    result = { error: err instanceof Error ? err.message : String(err) }
  }

  emit({ type: 'tool_result', name: tool.name, result })
  return { result }
}

// ── Workers AI (Kimi K2.5) provider via REST API ──

interface WorkersAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
}

async function callWorkersAI(
  messages: WorkersAIMessage[],
  env: Env,
  sessionId: string,
  emit: (event: AgentEvent) => void,
): Promise<{ content: string; tool_calls: any[]; finish_reason: string }> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai/run/@cf/moonshotai/kimi-k2.5`
  const body = {
    messages,
    tools: TOOLS_OPENAI,
    max_tokens: 8192,
  }

  console.log(`[workers-ai] calling kimi-k2.5, messages=${messages.length}, session=${sessionId}`)
  const startTime = Date.now()

  // AbortController with 120s timeout to prevent runaway requests
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 120_000)

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.CF_API_TOKEN}`,
        'Content-Type': 'application/json',
        'x-session-affinity': sessionId,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (err: any) {
    clearTimeout(timeout)
    if (err.name === 'AbortError') {
      throw new Error('Workers AI request timed out after 120s. Try a simpler query or switch to Claude.')
    }
    throw err
  }
  clearTimeout(timeout)

  const elapsed = Date.now() - startTime
  console.log(`[workers-ai] response status=${res.status}, elapsed=${elapsed}ms`)

  if (!res.ok) {
    const err = await res.text()
    console.error(`[workers-ai] error: ${err}`)
    throw new Error(`Workers AI error (${res.status}): ${err}`)
  }

  const data: any = await res.json()
  console.log(`[workers-ai] raw response keys: ${Object.keys(data).join(', ')}`)

  // Workers AI can return in different shapes
  const choice = data.result?.choices?.[0] ?? data.choices?.[0]
  if (choice) {
    const tc = choice.message?.tool_calls ?? []
    console.log(`[workers-ai] finish_reason=${choice.finish_reason}, tool_calls=${tc.length}, content_length=${(choice.message?.content ?? '').length}`)
    return {
      content: choice.message?.content ?? '',
      tool_calls: tc,
      finish_reason: choice.finish_reason ?? 'stop',
    }
  }

  // Fallback: non-OpenAI shape
  const fallbackContent = data.result?.response ?? data.response ?? ''
  const fallbackTools = data.result?.tool_calls ?? data.tool_calls ?? []
  console.log(`[workers-ai] fallback shape: content_length=${fallbackContent.length}, tool_calls=${fallbackTools.length}`)
  console.log(`[workers-ai] full response: ${JSON.stringify(data).substring(0, 500)}`)

  return {
    content: fallbackContent,
    tool_calls: fallbackTools,
    finish_reason: fallbackTools.length ? 'tool_calls' : 'stop',
  }
}

// Truncate tool result to keep context manageable for Workers AI
function truncateResult(result: unknown, maxChars = 8000): string {
  const json = JSON.stringify(result)
  if (json.length <= maxChars) return json
  console.log(`[agent] truncating tool result: ${json.length} → ${maxChars} chars`)
  return json.substring(0, maxChars) + '\n... [truncated, ' + json.length + ' chars total]'
}

async function runWorkersAI(
  userMessage: string,
  sessionId: string,
  env: Env,
  emit: (event: AgentEvent) => void,
) {
  const messages: WorkersAIMessage[] = [
    { role: 'system', content: getSystemPrompt() },
    { role: 'user', content: userMessage },
  ]

  let turn = 0
  let emptyRetries = 0
  const MAX_TURNS = 6
  while (turn < MAX_TURNS) {
    turn++
    const msgSize = JSON.stringify(messages).length
    console.log(`[agent] turn ${turn}/${MAX_TURNS}, messages=${messages.length}, context_size=${msgSize}`)
    const { content, tool_calls, finish_reason } = await callWorkersAI(messages, env, sessionId, emit)

    if (content) {
      emit({ type: 'text', content })
    }

    console.log(`[agent] turn ${turn} done: finish_reason=${finish_reason}, tool_calls=${tool_calls?.length ?? 0}, content_length=${content.length}`)

    // If model returned empty response, retry once with a nudge
    if (!content && !tool_calls?.length && emptyRetries < 2) {
      emptyRetries++
      console.log(`[agent] empty response, adding nudge (retry ${emptyRetries})`)
      messages.push({ role: 'assistant', content: null })
      messages.push({
        role: 'user',
        content: 'Continue with the analysis. Use execute_code to analyze the data with Python, then deploy_worker to create a report.',
      })
      continue
    }

    if (!tool_calls?.length) break

    // Add assistant message with tool calls
    messages.push({
      role: 'assistant',
      content: content || null,
      tool_calls,
    })

    // Execute each tool and add results
    for (const tc of tool_calls) {
      let args: Record<string, unknown>
      try {
        args = JSON.parse(tc.function.arguments)
      } catch {
        args = {}
      }

      const { result } = await executeTool(
        { id: tc.id, name: tc.function.name, arguments: args },
        env, sessionId, emit,
      )

      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: truncateResult(result),
      })
    }
  }
}

// ── Anthropic (Claude) provider ──

async function runAnthropic(
  userMessage: string,
  sessionId: string,
  env: Env,
  emit: (event: AgentEvent) => void,
) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userMessage }]

  while (true) {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      system: getSystemPrompt(),
      tools: TOOLS_ANTHROPIC,
      messages,
    })

    for (const block of response.content) {
      if (block.type === 'text' && block.text) {
        emit({ type: 'text', content: block.text })
      }
    }

    if (response.stop_reason === 'end_turn') break

    const toolResults: Anthropic.ToolResultBlockParam[] = []

    for (const block of response.content) {
      if (block.type !== 'tool_use') continue

      const { result } = await executeTool(
        { id: block.id, name: block.name, arguments: block.input as Record<string, unknown> },
        env, sessionId, emit,
      )

      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result),
      })
    }

    messages.push({ role: 'assistant', content: response.content })
    messages.push({ role: 'user', content: toolResults })
  }
}

// ── Entry point ──

export async function runAgent(
  userMessage: string,
  sessionId: string,
  env: Env,
  emit: (event: AgentEvent) => void,
  model: ModelProvider = 'kimi-k2.5',
) {
  if (model === 'claude-sonnet') {
    await runAnthropic(userMessage, sessionId, env, emit)
  } else {
    await runWorkersAI(userMessage, sessionId, env, emit)
  }

  emit({ type: 'done' })
}
