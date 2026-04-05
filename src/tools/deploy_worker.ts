import type { Env } from '../types'

interface DeployWorkerInput {
  name: string // e.g. "log-report-2026-04-03"
  code: string // JS Worker code to deploy
}

interface DeployResult {
  url: string
  name: string
  deployed: boolean
}

// ── Dynamic Workers preview (worker_loader) ──
// Loads the report as a temporary V8 isolate — no deployment, instant startup
export async function previewWorker(
  code: string,
  env: Env,
): Promise<{ html: string }> {
  const worker = await env.LOADER.load({
    compatibilityDate: '2026-01-01',
    modules: { 'report.js': code },
    mainModule: 'report.js',
  })
  const entrypoint = worker.getEntrypoint()
  const response = await entrypoint.fetch(new Request('https://preview/'))
  const html = await response.text()
  return { html }
}

// ── Permanent deployment (Workers REST API) ──
export async function deployWorker(input: DeployWorkerInput, env: Env): Promise<DeployResult> {
  const scriptName = input.name.toLowerCase().replace(/[^a-z0-9-]/g, '-')
  const apiBase = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}`
  const headers = { Authorization: `Bearer ${env.CF_API_TOKEN}` }

  // 1. Upload the Worker script
  const form = new FormData()
  form.append(
    'metadata',
    JSON.stringify({
      main_module: 'report.js',
      compatibility_date: '2026-01-01',
    }),
  )
  form.append(
    'report.js',
    new Blob([input.code], { type: 'application/javascript+module' }),
    'report.js',
  )

  const uploadRes = await fetch(
    `${apiBase}/workers/scripts/${scriptName}`,
    { method: 'PUT', headers, body: form },
  )

  if (!uploadRes.ok) {
    const err: any = await uploadRes.json()
    throw new Error(`Worker deploy failed: ${JSON.stringify(err.errors)}`)
  }

  // 2. Enable the workers.dev subdomain route
  await fetch(
    `${apiBase}/workers/scripts/${scriptName}/subdomain`,
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    },
  )

  // 3. Get the account's workers.dev subdomain
  const subdomainRes = await fetch(`${apiBase}/workers/subdomain`, { headers })
  const subdomainData: any = await subdomainRes.json()
  const subdomain = subdomainData.result?.subdomain ?? env.CF_ACCOUNT_ID

  return {
    name: scriptName,
    url: `https://${scriptName}.${subdomain}.workers.dev`,
    deployed: true,
  }
}

// Generates a self-contained report Worker from analysis results
export function buildReportWorker(params: {
  title: string
  summary: string
  body?: string  // Full AI analysis text — auto-injected from agent context
  anomalies: Array<{ time: string; requests: number; zscore: number }>
  chartBase64?: string
}): string {
  return `
export default {
  async fetch(request) {
    const html = ${JSON.stringify(buildReportHtml(params))};
    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
};
`.trim()
}

// Convert plain text (with markdown-like formatting) to HTML
function textToHtml(text: string): string {
  const lines = text.split('\n')
  const result: string[] = []
  let inList = false

  for (const line of lines) {
    const trimmed = line.trim()

    // Empty line = paragraph break
    if (!trimmed) {
      if (inList) { result.push('</ul>'); inList = false }
      result.push('<br>')
      continue
    }

    // Headings
    if (trimmed.startsWith('### ')) {
      if (inList) { result.push('</ul>'); inList = false }
      result.push(`<h4>${inlineFormat(trimmed.slice(4))}</h4>`)
      continue
    }
    if (trimmed.startsWith('## ')) {
      if (inList) { result.push('</ul>'); inList = false }
      result.push(`<h3>${inlineFormat(trimmed.slice(3))}</h3>`)
      continue
    }

    // Bullet / numbered lists
    const isBullet = trimmed.startsWith('- ') || trimmed.startsWith('* ')
    const numMatch = trimmed.match(/^\d+\.\s+(.*)/)
    if (isBullet || numMatch) {
      if (!inList) { result.push('<ul>'); inList = true }
      const content = isBullet ? trimmed.slice(2) : numMatch![1]
      result.push(`<li>${inlineFormat(content)}</li>`)
      continue
    }

    // Regular paragraph
    if (inList) { result.push('</ul>'); inList = false }
    result.push(`<p>${inlineFormat(trimmed)}</p>`)
  }

  if (inList) result.push('</ul>')
  return result.join('\n')
}

// Inline formatting: **bold**, `code`, --- (horizontal rule)
function inlineFormat(s: string): string {
  if (s === '---' || s === '***') return '<hr>'
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildReportHtml(params: {
  title: string
  summary: string
  body?: string
  anomalies: Array<{ time: string; requests: number; zscore: number }>
  chartBase64?: string
}): string {
  const rows = params.anomalies
    .map(
      (a) => `
      <tr>
        <td>${escapeHtml(a.time)}</td>
        <td>${a.requests.toLocaleString()}</td>
        <td><span class="zscore ${a.zscore > 3 ? 'critical' : 'warning'}">${a.zscore.toFixed(2)}σ</span></td>
      </tr>`,
    )
    .join('')

  const bodyHtml = params.body ? textToHtml(params.body) : ''
  const generatedAt = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC'

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(params.title)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #ffffff;
    --surface: #f9fafb;
    --surface-2: #f2f4f7;
    --border: #e5e7eb;
    --text: #1d1d1d;
    --text-secondary: #6b7280;
    --text-muted: #9ca3af;
    --orange: #f6821f;
    --orange-light: #fff7ed;
    --blue: #1e3a5f;
    --green: #059669;
    --green-light: #ecfdf5;
    --red: #dc2626;
    --red-light: #fef2f2;
    --yellow: #d97706;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    background: var(--bg);
    color: var(--text);
    font-size: 15px;
    line-height: 1.7;
    -webkit-font-smoothing: antialiased;
  }

  /* Header bar */
  .header {
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    padding: 0 32px;
    height: 56px;
    display: flex;
    align-items: center;
    gap: 12px;
    position: sticky;
    top: 0;
    z-index: 10;
  }
  .header svg { flex-shrink: 0; }
  .header-title { font-weight: 700; font-size: 0.95rem; color: var(--text); }
  .header-divider { color: var(--border); font-weight: 300; font-size: 1.2rem; }
  .header-sub { color: var(--text-secondary); font-size: 0.85rem; font-weight: 500; }
  .header-meta {
    margin-left: auto;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  /* Main content */
  .container {
    max-width: 860px;
    margin: 0 auto;
    padding: 32px 24px 64px;
  }

  h1 {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--text);
    margin-bottom: 4px;
    letter-spacing: -0.3px;
  }
  .meta {
    font-size: 0.8rem;
    color: var(--text-muted);
    margin-bottom: 28px;
  }

  /* Summary card */
  .summary-card {
    background: var(--orange-light);
    border: 1px solid #fed7aa;
    border-left: 4px solid var(--orange);
    border-radius: 8px;
    padding: 18px 20px;
    margin-bottom: 28px;
    font-size: 0.93rem;
    line-height: 1.8;
    color: var(--text);
  }
  .summary-card p { margin: 6px 0; }
  .summary-card ul { margin: 8px 0 8px 20px; padding: 0; }
  .summary-card li { margin: 4px 0; }
  .summary-card h3 { font-size: 0.95rem; font-weight: 700; color: var(--orange); margin: 14px 0 6px; }
  .summary-card h4 { font-size: 0.88rem; font-weight: 600; color: var(--text-secondary); margin: 10px 0 4px; }
  .summary-card strong { color: var(--orange); }
  .summary-card code {
    background: rgba(246,130,31,0.1);
    border: 1px solid #fed7aa;
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 0.85em;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }
  .summary-card br { display: block; content: ''; margin: 4px 0; }

  /* Chart */
  .chart-section {
    margin: 28px 0;
  }
  .chart-section img {
    width: 100%;
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  }

  /* Analysis section */
  .analysis-section {
    margin: 28px 0;
  }
  .section-title {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
  }
  .analysis-body {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 24px 28px;
    line-height: 1.85;
    font-size: 0.93rem;
  }
  .analysis-body p { margin: 10px 0; }
  .analysis-body br { display: block; content: ''; margin: 6px 0; }
  .analysis-body h3 {
    font-size: 1rem;
    font-weight: 700;
    color: var(--orange);
    margin: 24px 0 8px;
  }
  .analysis-body h4 {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-secondary);
    margin: 20px 0 6px;
  }
  .analysis-body ul {
    margin: 8px 0 8px 20px;
    padding: 0;
  }
  .analysis-body li {
    margin: 6px 0;
    line-height: 1.7;
  }
  .analysis-body strong { color: var(--orange); font-weight: 600; }
  .analysis-body code {
    background: var(--surface-2);
    border: 1px solid var(--border);
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 0.85em;
    font-family: 'SF Mono', 'Fira Code', monospace;
    color: var(--blue);
  }
  .analysis-body hr {
    border: none;
    border-top: 1px solid var(--border);
    margin: 20px 0;
  }

  /* Anomalies table */
  .anomalies-section { margin: 28px 0; }
  .anomaly-count {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--red-light);
    color: var(--red);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 2px 10px;
    border-radius: 9999px;
    margin-left: 8px;
  }
  .no-anomaly {
    background: var(--green-light);
    color: var(--green);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
    margin-top: 12px;
    font-size: 0.88rem;
  }
  thead { background: var(--surface-2); }
  th {
    text-align: left;
    padding: 10px 16px;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  td {
    padding: 10px 16px;
    border-top: 1px solid var(--border);
    color: var(--text);
  }
  tr:hover { background: var(--surface); }
  .zscore {
    display: inline-block;
    padding: 1px 8px;
    border-radius: 4px;
    font-weight: 600;
    font-size: 0.82rem;
  }
  .zscore.critical { background: var(--red-light); color: var(--red); }
  .zscore.warning { background: #fff7ed; color: var(--yellow); }

  /* Footer */
  .footer {
    margin-top: 48px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--text-muted);
    font-size: 0.75rem;
  }
  .footer-dot { width: 3px; height: 3px; border-radius: 50%; background: var(--border); }
</style>
</head>
<body>
  <div class="header">
    <svg width="24" height="24" viewBox="0 0 100 100" fill="none"><rect width="100" height="100" rx="20" fill="#F6821F"/><path d="M30 65 L45 35 L60 55 L70 42 L80 65 Z" fill="white" opacity="0.95"/><circle cx="38" cy="38" r="6" fill="white" opacity="0.7"/></svg>
    <span class="header-title">Log Investigator</span>
    <span class="header-divider">/</span>
    <span class="header-sub">Security Report</span>
    <span class="header-meta">${generatedAt}</span>
  </div>

  <div class="container">
    <h1>${escapeHtml(params.title)}</h1>
    <div class="meta">Generated by Cloudflare Log Investigator</div>

    <div class="summary-card">${textToHtml(params.summary)}</div>

    ${params.chartBase64 ? `<div class="chart-section"><img src="data:image/png;base64,${params.chartBase64}" alt="Traffic analysis chart"></div>` : ''}

    ${bodyHtml ? `<div class="analysis-section">
      <div class="section-title">AI Analysis</div>
      <div class="analysis-body">${bodyHtml}</div>
    </div>` : ''}

    ${params.anomalies.length > 0 ? `<div class="anomalies-section">
      <div class="section-title">Anomalies Detected <span class="anomaly-count">${params.anomalies.length}</span></div>
      <table>
        <thead><tr><th>Time (UTC)</th><th>Requests</th><th>Z-Score</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>` : `<div class="anomalies-section">
      <div class="section-title">Anomaly Detection <span class="anomaly-count no-anomaly">No anomalies</span></div>
      <p style="color:var(--text-muted);font-size:0.9rem;">All traffic within normal range (z-score &lt; 2.5&sigma;)</p>
    </div>`}

    <div class="footer">
      <span>Powered by Cloudflare Workers</span>
      <span class="footer-dot"></span>
      <span>Sandbox SDK</span>
      <span class="footer-dot"></span>
      <span>Dynamic Workers</span>
    </div>
  </div>
</body>
</html>`
}
