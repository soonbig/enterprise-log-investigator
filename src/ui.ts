export const UI_HTML = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Cloudflare Log Investigator</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #ffffff;
    --surface: #f9fafb;
    --surface-2: #f2f4f7;
    --border: #e5e7eb;
    --border-strong: #d1d5db;
    --text: #1d1d1d;
    --text-secondary: #6b7280;
    --text-muted: #9ca3af;
    --orange: #f6821f;
    --orange-light: #fff7ed;
    --orange-dark: #ea580c;
    --blue: #1e3a5f;
    --blue-light: #eff6ff;
    --green: #059669;
    --green-light: #ecfdf5;
    --yellow: #d97706;
    --yellow-light: #fffbeb;
    --red: #dc2626;
    --red-light: #fef2f2;
    --code-bg: #1e1e2e;
    --code-text: #cdd6f4;
  }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    font-size: 15px;
    height: 100dvh;
    display: flex;
    flex-direction: column;
    -webkit-font-smoothing: antialiased;
  }

  /* Header */
  header {
    padding: 0 24px;
    height: 56px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 16px;
    background: var(--bg);
    flex-shrink: 0;
  }

  .logo-mark {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .logo-mark svg {
    flex-shrink: 0;
  }

  .logo-text {
    font-size: 1rem;
    font-weight: 700;
    color: var(--text);
    letter-spacing: -0.3px;
  }

  .logo-divider {
    color: var(--border-strong);
    font-weight: 300;
    font-size: 1.2rem;
    margin: 0 2px;
  }

  .logo-sub {
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .header-right {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .zone-badge {
    background: var(--surface-2);
    border: 1px solid var(--border);
    padding: 4px 12px;
    border-radius: 6px;
    color: var(--text-secondary);
    font-size: 0.8rem;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .zone-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--green);
  }

  .model-select {
    appearance: none;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 4px 28px 4px 10px;
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--text-secondary);
    font-family: inherit;
    cursor: pointer;
    outline: none;
    transition: border-color 0.15s;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 8px center;
  }
  .model-select:hover { border-color: var(--orange); }
  .model-select:focus { border-color: var(--orange); box-shadow: 0 0 0 2px rgba(246,130,31,0.1); }

  .powered-by {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .powered-by strong {
    color: var(--text-secondary);
    font-weight: 600;
  }

  /* Chat area */
  .chat {
    flex: 1;
    overflow-y: auto;
    padding: 32px 24px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    max-width: 900px;
    width: 100%;
    margin: 0 auto;
  }

  .message { display: flex; flex-direction: column; gap: 8px; }

  .message.user .bubble {
    align-self: flex-end;
    background: var(--blue);
    color: #ffffff;
    padding: 10px 16px;
    border-radius: 16px 16px 4px 16px;
    max-width: 70%;
    line-height: 1.5;
    font-size: 0.93rem;
  }

  .message.assistant .bubble {
    align-self: flex-start;
    background: var(--surface);
    border: 1px solid var(--border);
    padding: 14px 18px;
    border-radius: 4px 16px 16px 16px;
    max-width: 85%;
    line-height: 1.7;
    white-space: pre-wrap;
    font-size: 0.93rem;
    color: var(--text);
  }

  /* Tool execution panels */
  .tool-panel {
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
    max-width: 85%;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }

  .tool-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: var(--surface);
    font-size: 0.8rem;
    color: var(--text-secondary);
    border-bottom: 1px solid var(--border);
  }

  .tool-header .tool-icon {
    width: 20px;
    height: 20px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.7rem;
  }

  .tool-icon.fetch { background: var(--blue-light); color: var(--blue); }
  .tool-icon.code { background: var(--yellow-light); color: var(--yellow); }
  .tool-icon.deploy { background: var(--orange-light); color: var(--orange); }

  .tool-header .tool-name { font-weight: 600; color: var(--text); font-size: 0.82rem; }
  .tool-header .status { margin-left: auto; font-weight: 500; display: flex; align-items: center; gap: 4px; }
  .status.running { color: var(--yellow); }
  .status.done { color: var(--green); }
  .status.error { color: var(--red); }

  .tool-body {
    padding: 0;
    font-size: 0.8rem;
    color: var(--text-secondary);
    background: var(--bg);
  }

  .tool-body pre {
    white-space: pre-wrap;
    word-break: break-word;
    font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
    font-size: 0.78rem;
    color: var(--text-muted);
    max-height: 200px;
    overflow-y: auto;
    padding: 12px 16px;
    margin: 0;
  }

  .tool-body pre.code {
    color: var(--code-text);
    background: var(--code-bg);
    padding: 14px 16px;
    border-radius: 0;
    border: none;
    font-size: 0.8rem;
    line-height: 1.5;
  }

  /* Chart */
  .chart-wrap {
    max-width: 85%;
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }
  .chart-wrap img { width: 100%; display: block; }

  /* Deploy badge */
  .deploy-banner {
    display: flex;
    align-items: center;
    gap: 14px;
    background: var(--green-light);
    border: 1px solid #a7f3d0;
    border-radius: 10px;
    padding: 14px 18px;
    max-width: 85%;
  }
  .deploy-banner .deploy-icon {
    width: 36px;
    height: 36px;
    background: var(--green);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .deploy-banner .deploy-icon svg { width: 18px; height: 18px; }
  .deploy-banner a {
    color: var(--green);
    text-decoration: none;
    font-size: 0.85rem;
    font-weight: 600;
    word-break: break-all;
  }
  .deploy-banner a:hover { text-decoration: underline; }
  .deploy-banner .label {
    color: var(--text-secondary);
    font-size: 0.75rem;
    font-weight: 500;
    margin-bottom: 2px;
  }

  /* Spinner */
  @keyframes spin { to { transform: rotate(360deg); } }
  .spinner {
    width: 12px; height: 12px;
    border: 2px solid var(--border);
    border-top-color: var(--orange);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    display: inline-block;
  }

  /* Input area */
  .input-area {
    padding: 16px 24px 20px;
    border-top: 1px solid var(--border);
    background: var(--bg);
    flex-shrink: 0;
  }

  .suggestions {
    max-width: 900px;
    margin: 0 auto 12px;
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .suggestion {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 14px;
    font-size: 0.82rem;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.15s;
    font-family: inherit;
  }
  .suggestion:hover {
    border-color: var(--orange);
    color: var(--orange);
    background: var(--orange-light);
  }

  .input-row {
    max-width: 900px;
    margin: 0 auto;
    display: flex;
    gap: 10px;
    align-items: flex-end;
  }

  .input-wrap {
    flex: 1;
    position: relative;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .input-wrap:focus-within {
    border-color: var(--orange);
    box-shadow: 0 0 0 3px rgba(246, 130, 31, 0.1);
  }

  textarea {
    width: 100%;
    background: transparent;
    border: none;
    color: var(--text);
    font-family: inherit;
    font-size: 0.93rem;
    padding: 12px 14px;
    resize: none;
    min-height: 44px;
    max-height: 160px;
    line-height: 1.5;
    outline: none;
  }
  textarea::placeholder { color: var(--text-muted); }

  button[type=submit] {
    background: var(--orange);
    color: #ffffff;
    border: none;
    border-radius: 10px;
    padding: 0 20px;
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
    height: 44px;
    transition: background 0.15s;
    white-space: nowrap;
    font-family: inherit;
  }
  button[type=submit]:hover { background: var(--orange-dark); }
  button[type=submit]:disabled { opacity: 0.4; cursor: not-allowed; }

  .thinking { color: var(--text-muted); font-size: 0.8rem; display: flex; align-items: center; gap: 6px; }

  /* Scrollbar */
  .chat::-webkit-scrollbar { width: 6px; }
  .chat::-webkit-scrollbar-track { background: transparent; }
  .chat::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
  .chat::-webkit-scrollbar-thumb:hover { background: var(--border-strong); }

  .tool-body pre::-webkit-scrollbar { width: 4px; }
  .tool-body pre::-webkit-scrollbar-track { background: transparent; }
  .tool-body pre::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
</style>
</head>
<body>

<header>
  <div class="logo-mark">
    <svg width="28" height="28" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="100" height="100" rx="20" fill="#F6821F"/>
      <path d="M30 65 L45 35 L60 55 L70 42 L80 65 Z" fill="white" opacity="0.95"/>
      <circle cx="38" cy="38" r="6" fill="white" opacity="0.7"/>
    </svg>
    <span class="logo-text">Log Investigator</span>
  </div>
  <span class="logo-divider">/</span>
  <span class="logo-sub">Cloudflare Security Analytics</span>
  <div class="header-right">
    <select id="modelSelect" class="model-select">
      <option value="kimi-k2.5">Kimi K2.5 (Workers AI)</option>
      <option value="claude-sonnet">Claude Sonnet 4.6</option>
    </select>
    <div class="zone-badge"><span class="zone-dot"></span> {{ZONE_NAME}}</div>
  </div>
</header>

<div class="chat" id="chat">
  <div class="message assistant">
    <div class="bubble">{{ZONE_NAME}} のログ調査をお手伝いします。

怪しいトラフィックの検知、特定時間帯の異常リクエスト分析、ファイアウォールイベントの確認など、何でもどうぞ。</div>
  </div>
</div>

<div class="input-area">
  <div class="suggestions" id="suggestions">
    <button class="suggestion" onclick="fillSuggestion(this)">昨日の夜中に異常なリクエストがあったか調べて</button>
    <button class="suggestion" onclick="fillSuggestion(this)">過去24時間のトラフィックを分析して</button>
    <button class="suggestion" onclick="fillSuggestion(this)">ファイアウォールでブロックされたIPを教えて</button>
  </div>
  <div class="input-row">
    <div class="input-wrap">
      <textarea
        id="input"
        placeholder="ログについて質問してください..."
        rows="1"
        onkeydown="handleKey(event)"
        oninput="autoResize(this)"
      ></textarea>
    </div>
    <button type="submit" id="send" onclick="sendMessage()">送信</button>
  </div>
</div>

<script>
  const chat = document.getElementById('chat')
  const input = document.getElementById('input')
  const sendBtn = document.getElementById('send')
  const modelSelect = document.getElementById('modelSelect')
  const sessionId = crypto.randomUUID()

  // Pre-warm sandbox on page load
  fetch('/api/warmup').catch(() => {})

  let currentAssistantBubble = null
  let currentTextContent = ''

  function autoResize(el) {
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  function fillSuggestion(btn) {
    input.value = btn.textContent
    autoResize(input)
    input.focus()
    document.getElementById('suggestions').style.display = 'none'
  }

  function scrollBottom() {
    chat.scrollTop = chat.scrollHeight
  }

  function addUserMessage(text) {
    const div = document.createElement('div')
    div.className = 'message user'
    div.innerHTML = \`<div class="bubble">\${escHtml(text)}</div>\`
    chat.appendChild(div)
    scrollBottom()
  }

  function startAssistantMessage() {
    currentTextContent = ''
    const wrap = document.createElement('div')
    wrap.className = 'message assistant'
    const bubble = document.createElement('div')
    bubble.className = 'bubble'
    wrap.appendChild(bubble)
    chat.appendChild(wrap)
    currentAssistantBubble = bubble
    scrollBottom()
    return wrap
  }

  function appendText(text) {
    if (!currentAssistantBubble) startAssistantMessage()
    currentTextContent += text
    currentAssistantBubble.textContent = currentTextContent
    scrollBottom()
  }

  function addToolPanel(name, input) {
    const panel = document.createElement('div')
    panel.className = 'tool-panel'

    const iconClass = { fetch_logs: 'fetch', execute_code: 'code', deploy_worker: 'deploy' }[name] || 'fetch'
    const iconText = { fetch_logs: '\\u{1F4E1}', execute_code: '\\u{2699}\\uFE0F', deploy_worker: '\\u{1F680}' }[name] || '\\u{1F527}'
    const label = { fetch_logs: 'fetch_logs', execute_code: 'execute_code', deploy_worker: 'deploy_worker' }[name] || name

    panel.innerHTML = \`
      <div class="tool-header">
        <span class="tool-icon \${iconClass}">\${iconText}</span>
        <span class="tool-name">\${label}</span>
        <span class="status running"><span class="spinner"></span> running</span>
      </div>
      <div class="tool-body">
        \${name === 'execute_code' ? \`<pre class="code">\${escHtml(input.code ?? '')}</pre>\` : \`<pre>\${escHtml(JSON.stringify(input, null, 2))}</pre>\`}
      </div>
    \`

    const wrap = document.createElement('div')
    wrap.className = 'message assistant'
    wrap.appendChild(panel)
    chat.appendChild(wrap)
    scrollBottom()
    return panel
  }

  function markToolDone(panel, result) {
    const status = panel.querySelector('.status')
    if (result?.error) {
      status.className = 'status error'
      status.textContent = '\\u2717 error'
      const body = panel.querySelector('.tool-body')
      const err = document.createElement('pre')
      err.style.color = 'var(--red)'
      err.textContent = result.error
      body.appendChild(err)
    } else {
      status.className = 'status done'
      status.textContent = '\\u2713 done'
    }
    scrollBottom()
  }

  function addChart(base64) {
    const wrap = document.createElement('div')
    wrap.className = 'message assistant'
    const chartWrap = document.createElement('div')
    chartWrap.className = 'chart-wrap'
    chartWrap.innerHTML = \`<img src="data:image/png;base64,\${base64}" alt="Analysis chart">\`
    wrap.appendChild(chartWrap)
    chat.appendChild(wrap)
    scrollBottom()
  }

  function addDeployBanner(url, name) {
    const wrap = document.createElement('div')
    wrap.className = 'message assistant'
    wrap.innerHTML = \`
      <div class="deploy-banner">
        <div class="deploy-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/>
          </svg>
        </div>
        <div>
          <div class="label">Worker deployed</div>
          <a href="\${url}" target="_blank" rel="noopener">\${url}</a>
        </div>
      </div>
    \`
    chat.appendChild(wrap)
    scrollBottom()
  }

  function escHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  async function sendMessage() {
    const text = input.value.trim()
    if (!text || sendBtn.disabled) return

    input.value = ''
    input.style.height = 'auto'
    sendBtn.disabled = true
    document.getElementById('suggestions').style.display = 'none'

    addUserMessage(text)

    // Reset assistant state
    currentAssistantBubble = null
    currentTextContent = ''

    let activePanel = null

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId, model: modelSelect.value }),
      })

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })

        const parts = buf.split('\\n\\n')
        buf = parts.pop() ?? ''

        for (const part of parts) {
          if (!part.startsWith('data: ')) continue
          const event = JSON.parse(part.slice(6))

          if (event.type === 'text') {
            appendText(event.content)
          } else if (event.type === 'tool_start') {
            currentAssistantBubble = null // new section
            activePanel = addToolPanel(event.name, event.input)
          } else if (event.type === 'tool_result') {
            if (activePanel) markToolDone(activePanel, event.result)
            activePanel = null
            currentAssistantBubble = null
          } else if (event.type === 'chart') {
            addChart(event.base64)
          } else if (event.type === 'deploy') {
            addDeployBanner(event.url, event.workerName)
          } else if (event.type === 'error') {
            appendText('\\n\\nError: ' + event.message)
          }
        }
      }
    } catch (err) {
      appendText('\\n\\nConnection error: ' + err.message)
    } finally {
      sendBtn.disabled = false
      input.focus()
    }
  }
</script>
</body>
</html>
`
