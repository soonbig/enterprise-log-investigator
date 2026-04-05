import type { Sandbox } from './index'

export interface Env {
  // Config (wrangler.toml [vars])
  ZONE_NAME: string

  // Secrets (wrangler secret put)
  ANTHROPIC_API_KEY: string
  CF_API_TOKEN: string
  CF_ZONE_ID: string
  CF_ACCOUNT_ID: string

  // Bindings
  AI: Ai
  SANDBOX: DurableObjectNamespace<Sandbox>
  LOADER: {
    load(opts: {
      compatibilityDate: string
      modules: Record<string, string>
      mainModule: string
    }): Promise<{ getEntrypoint(): Record<string, (...args: any[]) => Promise<any>> }>
  }
}

export type ModelProvider = 'kimi-k2.5' | 'claude-sonnet'

// SSE event types streamed to the browser
export type AgentEvent =
  | { type: 'text'; content: string }
  | { type: 'tool_start'; name: string; input: unknown }
  | { type: 'tool_result'; name: string; result: unknown }
  | { type: 'chart'; base64: string }
  | { type: 'preview'; html: string; workerCode: string; workerName: string }
  | { type: 'deploy'; url: string; workerName: string }
  | { type: 'done' }
  | { type: 'error'; message: string }
