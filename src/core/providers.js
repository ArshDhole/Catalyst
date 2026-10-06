// Catalyst universal AI provider layer.
// One interface — many keys: Anthropic, OpenAI, Gemini, OpenRouter,
// OpenCode Zen, or any OpenAI-compatible endpoint. No extra SDKs (fetch only).
//
// Env:
//   AI_PROVIDER=auto|anthropic|openai|gemini|openrouter|zen|custom  (default auto)
//   MODEL=...                 generic override for the resolved provider
//   ANTHROPIC_API_KEY / ANTHROPIC_MODEL (default claude-opus-4-20250805)
//   OPENAI_API_KEY / OPENAI_MODEL (default gpt-4o) / OPENAI_BASE_URL?
//   GEMINI_API_KEY (aka GOOGLE_API_KEY) / GEMINI_MODEL (default gemini-2.0-flash)
//   OPENROUTER_API_KEY / OPENROUTER_MODEL (default anthropic/claude-opus-4-6)
//   ZEN_API_KEY (aka OPENCODE_ZEN_API_KEY) / ZEN_MODEL (default big-pickle)
//     Zen base: https://opencode.ai/zen/v1 — chat/completions is the
//     OpenAI-compatible endpoint (GLM/Kimi/Qwen/Big Pickle/...). Responses-only
//     models (gpt-*, muse-spark-*) live under /responses and are NOT supported
//     by this layer — pick a chat/completions model (see GET /api/providers).
//   CUSTOM_BASE_URL + CUSTOM_API_KEY + CUSTOM_MODEL — any OpenAI-compatible server
//     (Ollama, LM Studio, vLLM, Together, DeepSeek, Groq, Mistral, xAI, ...)

export const PROVIDERS = {
  anthropic: {
    label: 'Anthropic Claude',
    keyEnvs: ['ANTHROPIC_API_KEY'],
    modelEnvs: ['ANTHROPIC_MODEL', 'MODEL'],
    defaultModel: 'claude-opus-4-20250805',
    protocol: 'anthropic-messages',
    baseUrl: 'https://api.anthropic.com/v1/messages',
  },
  openai: {
    label: 'OpenAI ChatGPT',
    keyEnvs: ['OPENAI_API_KEY'],
    modelEnvs: ['OPENAI_MODEL', 'MODEL'],
    defaultModel: 'gpt-4o',
    protocol: 'openai-chat',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
  },
  gemini: {
    label: 'Google Gemini',
    keyEnvs: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
    modelEnvs: ['GEMINI_MODEL', 'MODEL'],
    defaultModel: 'gemini-2.0-flash',
    protocol: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
  },
  openrouter: {
    label: 'OpenRouter',
    keyEnvs: ['OPENROUTER_API_KEY'],
    modelEnvs: ['OPENROUTER_MODEL', 'MODEL'],
    defaultModel: 'anthropic/claude-opus-4-6',
    protocol: 'openai-chat',
    baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
  },
  zen: {
    label: 'OpenCode Zen',
    keyEnvs: ['ZEN_API_KEY', 'OPENCODE_ZEN_API_KEY'],
    modelEnvs: ['ZEN_MODEL', 'MODEL'],
    defaultModel: 'big-pickle',
    protocol: 'openai-chat',
    baseUrl: 'https://opencode.ai/zen/v1/chat/completions',
    note: 'Use a chat/completions model (e.g. big-pickle, kimi-k3, glm-5). Responses-only models (gpt-*, muse-spark-*) need /responses and are not supported.',
  },
  custom: {
    label: 'Custom (OpenAI-compatible)',
    keyEnvs: ['CUSTOM_API_KEY'],
    modelEnvs: ['CUSTOM_MODEL', 'MODEL'],
    defaultModel: 'default',
    protocol: 'openai-chat',
    baseUrl: null, // must come from CUSTOM_BASE_URL
  },
};

const AUTO_PRIORITY = ['anthropic', 'openrouter', 'openai', 'gemini', 'zen', 'custom'];

function firstSet(envNames) {
  for (const n of envNames) {
    const v = process.env[n];
    if (v && v.trim() && !v.includes('your-') && !v.includes('here')) return v.trim();
  }
  return null;
}

export function getProviderConfig(id, keyOverride) {
  const def = PROVIDERS[id];
  if (!def) throw new Error(`Unknown AI provider "${id}". Valid: ${Object.keys(PROVIDERS).join(', ')}`);
  const override = (keyOverride || '').trim();
  const apiKey = override || firstSet(def.keyEnvs);
  let baseUrl = def.baseUrl;
  if (id === 'custom') baseUrl = (process.env.CUSTOM_BASE_URL || '').trim() || null;
  if (id === 'openai' && (process.env.OPENAI_BASE_URL || '').trim()) baseUrl = process.env.OPENAI_BASE_URL.trim();
  const model = firstSet(def.modelEnvs) || def.defaultModel;
  return { id, ...def, apiKey, model, baseUrl, configured: !!apiKey && !!baseUrl, fromRequest: !!override };
}

/**
 * Resolve which provider+model to use.
 * Precedence: explicit request > AI_PROVIDER env > auto-detect.
 * A per-request key (BYOK from the UI) overrides env keys — but requires
 * an explicit provider, since a bare key can't be attributed in auto mode.
 */
export function resolveProvider(requested, requestedModel, keyOverride) {
  const want = (requested || process.env.AI_PROVIDER || 'auto').toLowerCase().trim();
  const override = (keyOverride || '').trim();
  if (override && want === 'auto') {
    throw new Error('Pick a provider to use with a request-supplied API key (auto + key is ambiguous).');
  }
  if (want !== 'auto') {
    const cfg = getProviderConfig(want, override);
    if (!cfg.apiKey) throw new Error(`Provider "${want}" selected but no API key found (expected ${cfg.keyEnvs.join(' or ')}).`);
    if (!cfg.baseUrl) throw new Error(`Provider "custom" needs CUSTOM_BASE_URL set.`);
    return { ...cfg, model: (requestedModel || '').trim() || cfg.model };
  }
  for (const id of AUTO_PRIORITY) {
    const cfg = getProviderConfig(id);
    if (cfg.configured) return { ...cfg, model: (requestedModel || '').trim() || cfg.model };
  }
  throw new Error(
    'No AI API key configured. Set one of: ANTHROPIC_API_KEY, OPENROUTER_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, ZEN_API_KEY (or CUSTOM_BASE_URL + CUSTOM_API_KEY). Offline rule-based mode still works for Python 2→3 / ES5→ES2020.'
  );
}

/** Safe for GET /api/providers — never leaks keys. */
export function listProviders() {
  return Object.keys(PROVIDERS).map((id) => {
    const cfg = getProviderConfig(id);
    return {
      id,
      label: cfg.label,
      configured: cfg.configured,
      defaultModel: cfg.defaultModel,
      baseUrl: id === 'custom' ? (process.env.CUSTOM_BASE_URL || null) : cfg.baseUrl,
      ...(cfg.note ? { note: cfg.note } : {}),
    };
  });
}

export function hasAnyKey() {
  return Object.keys(PROVIDERS).some((id) => getProviderConfig(id).configured);
}

/**
 * Universal completion. Returns plain text (JSON expected by callers).
 * Throws with provider + status context on failure.
 */
export async function complete({ system, user, maxTokens = 8000, temperature = 0.2, provider, model, apiKey, fetchImpl }) {
  const cfg = resolveProvider(provider, model, apiKey);
  const fetchFn = fetchImpl || fetch;
  if (cfg.protocol === 'anthropic-messages') return completeAnthropic(cfg, { system, user, maxTokens, temperature }, fetchFn);
  if (cfg.protocol === 'gemini') return completeGemini(cfg, { system, user, maxTokens, temperature }, fetchFn);
  return completeOpenAIChat(cfg, { system, user, maxTokens, temperature }, fetchFn);
}

async function completeAnthropic(cfg, { system, user, maxTokens, temperature }, fetchFn) {
  const res = await fetchFn(cfg.baseUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: maxTokens,
      temperature,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(`[${cfg.id}] ${res.status}: ${await safeBody(res)}`);
  const data = await res.json();
  const text = data?.content?.map((b) => b?.text || '').join('') || '';
  if (!text) throw new Error(`[${cfg.id}] empty response`);
  return { text, provider: cfg.id, model: cfg.model };
}

async function completeOpenAIChat(cfg, { system, user, maxTokens, temperature }, fetchFn) {
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` };
  if (cfg.id === 'openrouter') {
    headers['HTTP-Referer'] = process.env.OPENROUTER_SITE_URL || 'http://localhost:3000';
    headers['X-Title'] = process.env.OPENROUTER_APP_NAME || 'Catalyst';
  }
  const res = await fetchFn(cfg.baseUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: maxTokens,
      temperature,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`[${cfg.id}] ${res.status}: ${await safeBody(res)}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || '';
  if (!text) throw new Error(`[${cfg.id}] empty response (model "${cfg.model}" may not exist on this endpoint)`);
  return { text, provider: cfg.id, model: cfg.model };
}

async function completeGemini(cfg, { system, user, maxTokens, temperature }, fetchFn) {
  const url = `${cfg.baseUrl}/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;
  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      system_instruction: system ? { parts: [{ text: system }] } : undefined,
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature },
    }),
  });
  if (!res.ok) throw new Error(`[${cfg.id}] ${res.status}: ${await safeBody(res)}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p?.text || '').join('') || '';
  if (!text) throw new Error(`[${cfg.id}] empty response`);
  return { text, provider: cfg.id, model: cfg.model };
}

async function safeBody(res) {
  try {
    const t = await res.text();
    return t.slice(0, 500);
  } catch {
    return res.statusText || 'request failed';
  }
}
