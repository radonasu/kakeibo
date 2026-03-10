// ============================================================
// config.js - アプリ設定（管理者用）
// ============================================================
// ⚠️ このファイルはアプリオーナーが一度だけ設定します
// エンドユーザーは何も設定不要です
//
// 【設定手順】
// 1. supabase.com で無料プロジェクトを作成
// 2. SQL Editorで household_data テーブルを作成（設定画面のSQLを参照）
// 3. Settings → API から URL と anon key をコピーして下記に貼り付け
// 4. GitHubにpushするだけ — ユーザーはメール/パスワードで利用可能に！
// ============================================================

const APP_CONFIG = {
  // ── Supabase接続設定 ────────────────────────────────────
  // 未設定の場合、ユーザーは設定画面で自分で入力できます
  supabase: {
    url: 'https://xiafublrejxdegmdoyfg.supabase.co',
    anonKey: 'sb_publishable_fxo0mVQTq1fZhdS1RLWgDQ_-v2REvfn',
  },

  // ── Gemini API プロキシ設定 ──────────────────────────────
  // Cloudflare Workers にデプロイしたプロキシのURL
  // デプロイ手順は cloudflare-worker/worker.js を参照
  geminiProxy: {
    url: 'https://kakeibo-gemini-proxy.ccffdmw.workers.dev',
  },

  // ── アプリ設定 ──────────────────────────────────────────
  app: {
    name: '家族家計簿',
    version: '5.7',
  },
};
