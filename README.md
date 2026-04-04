# Enterprise Log Investigator

Cloudflare Workers 上で動く AI ログ分析アプリです。自然言語で質問すると、AI が自律的にログ取得・Python 分析・レポートデプロイまでを実行します。

Sandbox SDK、Dynamic Workers、Claude API の tool use を組み合わせたデモアプリとして構築しました。

## デモ

```
「昨日の夜中に異常なリクエストがあったか調べて」
  → AI が時間範囲を判断
  → fetch_logs: Cloudflare GraphQL から実データ取得
  → execute_code: Sandbox で Python 実行（z-score 異常検知 + matplotlib チャート）
  → deploy_worker: 分析結果を Worker としてデプロイ
  → UI にチャート + 異常一覧 + レポート URL を表示
```

## アーキテクチャ

```
Browser (Chat UI)
    ↓ SSE streaming
Cloudflare Worker (Hono)
    ↓ tool use loop
LLM (Kimi K2.5 or Claude Sonnet 4.6)
    ├── Tool: fetch_logs      → Cloudflare Analytics GraphQL
    ├── Tool: execute_code    → Sandbox SDK (Python)
    └── Tool: deploy_worker   → Workers API (動的デプロイ)
```

## 技術スタック

| レイヤー | 技術 |
|---|---|
| フロントエンド | Vanilla JS（インライン HTML） |
| API サーバー | Hono on Workers |
| AI（デフォルト） | Kimi K2.5 (Workers AI) |
| AI（選択可能） | Claude Sonnet 4.6 (Anthropic API) |
| コード実行 | @cloudflare/sandbox |
| データ取得 | Cloudflare Analytics GraphQL |
| レポート公開 | Workers API（動的デプロイ） |

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
├── index.ts              Hono アプリ + SSE エンドポイント
├── agent.ts              エージェントループ（Kimi K2.5 / Claude 両対応）
├── types.ts              型定義
├── ui.ts                 チャット UI（インライン HTML）
└── tools/
    ├── fetch_logs.ts     Cloudflare Analytics GraphQL
    ├── execute_code.ts   Sandbox SDK（Python 実行）
    └── deploy_worker.ts  Dynamic Workers（レポートデプロイ）
sandbox/
└── Dockerfile            Python 実行環境（pandas, matplotlib 等）
```

## LLM プロバイダー

UI のドロップダウンから切り替え可能です。

| プロバイダー | メリット | デメリット |
|---|---|---|
| **Kimi K2.5**（デフォルト） | Workers AI 無料枠、外部 API 不要 | マルチターン tool use がやや不安定 |
| **Claude Sonnet 4.6** | tool use が安定、レスポンス高速 | Anthropic API 従量課金 |

## 関連ブログ

- [Sandbox SDK と Dynamic Workers で Workers アプリは何が変わるのか](リンク)

## ライセンス

MIT
