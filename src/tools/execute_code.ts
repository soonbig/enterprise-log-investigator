import { getSandbox } from '@cloudflare/sandbox'
import type { Env } from '../types'

interface ExecuteCodeInput {
  code: string
  language?: 'python' | 'javascript' | 'typescript'
}

interface CodeResult {
  output: string
  success: boolean
  error?: string
  chart?: string // base64 PNG
  html?: string
  json?: unknown
}

export async function executeCode(
  input: ExecuteCodeInput,
  env: Env,
  sessionId: string,
): Promise<CodeResult> {
  const sandbox = await getSandbox(env.SANDBOX, sessionId)

  // Retry up to 5x on cold start ("Container is starting")
  let result
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      result = await sandbox.runCode(input.code, {
        language: input.language ?? 'python',
      })
      break
    } catch (err: any) {
      const isStarting = err?.message?.toLowerCase().includes('container is starting') ||
                         err?.message?.toLowerCase().includes('starting')
      if (isStarting && attempt < 4) {
        await new Promise((r) => setTimeout(r, 3000 + attempt * 2000))
        continue
      }
      throw err
    }
  }

  if (!result) throw new Error('Sandbox failed to start after retries')

  const stdout = result.logs.stdout.join('\n')
  const stderr = result.logs.stderr.join('\n')
  const output = [stdout, stderr].filter(Boolean).join('\n')

  // Results array contains rich output (png, html, json, text)
  const richResult = result.results?.[0]

  // Check for CHART: prefix in stdout (our fallback approach)
  let chart: string | undefined = richResult?.png
  if (!chart && stdout.includes('CHART:')) {
    const match = stdout.match(/CHART:([A-Za-z0-9+/=\n]+)/)
    if (match) chart = match[1].replace(/\s/g, '')
  }

  return {
    output,
    success: !result.error,
    error: result.error ? String(result.error) : undefined,
    chart,
    html: richResult?.html,
    json: richResult?.json,
  }
}
