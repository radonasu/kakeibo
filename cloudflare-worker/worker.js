// ============================================================
// Cloudflare Workers - Gemini API CORS Proxy
// ============================================================
//
// 【デプロイ手順】
// 1. https://dash.cloudflare.com にログイン（無料アカウントでOK）
// 2. Workers & Pages → Create Application → Create Worker
// 3. 名前を入力（例: kakeibo-gemini-proxy）→ Deploy
// 4. Edit Code → このファイルの内容を貼り付け → Save and Deploy
// 5. 発行されたURL（例: https://kakeibo-gemini-proxy.xxxxx.workers.dev）を
//    config.js の geminiProxy.url に設定
//
// 【無料枠】
// - 月100,000リクエスト（家計簿利用には十分）
// ============================================================

const ALLOWED_ORIGINS = [
  'https://radonasu.github.io',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
];

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com';
const GEMINI_MODEL = 'gemini-2.5-flash-preview-05-20';

export default {
  async fetch(request) {
    // ── CORS preflight ──
    if (request.method === 'OPTIONS') {
      return handleCORS(request);
    }

    // ── POST /gemini のみ受付 ──
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/gemini') {
      return new Response('Not Found', { status: 404 });
    }

    // ── Origin チェック ──
    const origin = request.headers.get('Origin') || '';
    if (!isAllowedOrigin(origin)) {
      return new Response('Forbidden', { status: 403 });
    }

    try {
      const body = await request.json();
      const { apiKey, payload } = body;

      if (!apiKey || !payload) {
        return corsResponse(origin, JSON.stringify({
          error: { message: 'apiKey and payload are required' }
        }), 400);
      }

      // ── Gemini API に転送 ──
      const geminiUrl = `${GEMINI_API_BASE}/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

      const geminiResp = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const respBody = await geminiResp.text();
      return corsResponse(origin, respBody, geminiResp.status);

    } catch (err) {
      return corsResponse(origin, JSON.stringify({
        error: { message: err.message || 'Proxy error' }
      }), 500);
    }
  },
};

// ── ヘルパー関数 ──

function isAllowedOrigin(origin) {
  return ALLOWED_ORIGINS.some(o => origin === o || origin.startsWith(o));
}

function handleCORS(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = isAllowedOrigin(origin);
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': allowed ? origin : '',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}

function corsResponse(origin, body, status) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
    },
  });
}
