# Cloudflare Log Investigator

Cloudflare Workers 上で動く AI ログ分析エージェントです。自然言語で質問すると、AI が自律的にログ取得・Python 分析・レポートプレビュー・デプロイまでを実行します。

Sandbox SDK、Dynamic Workers、Claude API / Workers AI の tool use を組み合わせたデモアプリです。

> **ブログ記事:** [Cloudflare Sandbox SDK + Dynamic Workers で作る AI ログ分析エージェント](https://qiita.com/sooncloud/items/7fd161211915333b3f5c)

## デモ

```
「昨日の夜中に異常なリクエストがあったか調べて」
  → AI が時間範囲を判断
  → fetch_logs: Cloudflare GraphQL から実データ取得
  → execute_code: Sandbox で Python 実行（z-score 異常検知 + matplotlib チャート）
  → preview_report: Dynamic Workers でレポートを即座にプレビュー
  → ユーザーが確認 →「デプロイする」ボタン
  → deploy_worker: Workers API で永続デプロイ
  → UI にチャート + 異常一覧 + レポート URL を表示
```

## アーキテクチャ

```
Browser (Chat UI)
    ↓ SSE streaming
Cloudflare Worker (Hono)
    ↓ tool use loop
LLM (Kimi K2.5 or Claude Sonnet 4.6)
    ├── Tool: fetch_logs       → Cloudflare Analytics GraphQL
    ├── Tool: execute_code     → Sandbox SDK (Python)
    ├── Tool: preview_report   → Dynamic Workers / worker_loader (プレビュー)
    └── Tool: deploy_worker    → Workers REST API (永続デプロイ)
```

### Dynamic Workers によるプレビュー

レポートのデプロイ前に `worker_loader` で一時的な V8 isolate を生成し、即座にプレビューを表示します。ユーザーが確認してから永続デプロイが実行されます（Human in the Loop）。

```typescript
// Dynamic Workers: 一時的なプレビュー（ミリ秒で起動）
const worker = await env.LOADER.load({
  compatibilityDate: '2026-01-01',
  modules: { 'report.js': reportCode },
  mainModule: 'report.js',
})
const entrypoint = worker.getEntrypoint()
const response = await entrypoint.fetch(new Request('https://preview/'))

// ユーザー確認後 → Workers REST API で永続デプロイ
await deployWorker({ name, code: reportCode }, env)
```

| | Dynamic Workers（プレビュー） | REST API（永続デプロイ） |
|---|---|---|
| 起動時間 | ミリ秒 | 数秒 |
| 寿命 | リクエスト中のみ | 削除するまで永続 |
| URL | なし（親 Worker 内で実行） | `*.workers.dev` |

## 技術スタック

| レイヤー | 技術 |
|---|---|
| フロントエンド | Vanilla JS（インライン HTML） |
| API サーバー | Hono on Workers |
| AI（デフォルト） | Kimi K2.5 (Workers AI) |
| AI（選択可能） | Claude Sonnet 4.6 (Anthropic API) |
| コード実行 | @cloudflare/sandbox (Containers) |
| データ取得 | Cloudflare Analytics GraphQL |
| レポートプレビュー | Dynamic Workers (`worker_loader`) |
| レポート公開 | Workers REST API |

## セットアップ

### 前提条件

- Cloudflare アカウント（Paid Workers プラン）
- 分析対象のゾーン（ドメイン）
- Node.js 18+

### インストール

```bash
npm install
```

### Secrets の設定

**1. `wrangler.toml` でドメインを設定：**

```toml
[vars]
ZONE_NAME = "example.com"   # 分析対象のドメイン名
```

**2. Secrets を設定：**

```bash
npx wrangler secret put ANTHROPIC_API_KEY   # Claude を使う場合
npx wrangler secret put CF_API_TOKEN        # 下記パーミッション参照
npx wrangler secret put CF_ZONE_ID          # 分析対象ゾーンの Zone ID
npx wrangler secret put CF_ACCOUNT_ID       # Cloudflare Account ID
```

`CF_API_TOKEN` に必要なパーミッション：

| リソース | パーミッション |
|---|---|
| Account → Workers Scripts | Edit |
| Account → Account Settings | Read |
| Account → Workers AI | Read |
| Zone → Analytics | Read |

### デプロイ

```bash
npm run deploy
```

### ローカル開発

```bash
npm run dev
```

## プロジェクト構成

```
src/
├── index.ts              Hono アプリ + SSE + /api/deploy エンドポイント
├── agent.ts              エージェントループ（Kimi K2.5 / Claude 両対応）
├── types.ts              型定義（AgentEvent, Env）
├── ui.ts                 チャット UI（ステータスバー、プレビューパネル）
└── tools/
    ├── fetch_logs.ts     Cloudflare Analytics GraphQL（3日自動分割）
    ├── execute_code.ts   Sandbox SDK（Python 実行 + コールドスタートリトライ）
    └── deploy_worker.ts  プレビュー（worker_loader）+ 永続デプロイ（REST API）
sandbox/
└── Dockerfile            Python 実行環境（pandas, matplotlib, CJK フォント）
wrangler.toml             Workers 設定（Containers, AI, worker_loader, Observability）
```

## LLM プロバイダー

UI のドロップダウンから切り替え可能です。

| プロバイダー | メリット | デメリット |
|---|---|---|
| **Kimi K2.5**（デフォルト） | Workers AI 無料枠、外部 API 不要 | マルチターン tool use がやや不安定 |
| **Claude Sonnet 4.6** | tool use が安定、分析の深さと具体性が高い | Anthropic API 従量課金 |

## 関連ブログ

- [Cloudflare Sandbox SDK + Dynamic Workers で作る AI ログ分析エージェント](https://qiita.com/sooncloud/items/7fd161211915333b3f5c)

## ライセンス

MIT
