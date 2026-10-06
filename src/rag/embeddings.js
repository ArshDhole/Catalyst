import crypto from 'crypto';
import { getProviderConfig } from '../core/providers.js';
import { logger } from '../utils/logger.js';

// Embeddings for RAG retrieval. Two modes:
// - "provider": real vectors via OpenAI-compatible /embeddings or Gemini embedContent
// - "tfidf": deterministic local hashed-TF vectors. Zero config, zero cost,
//   surprisingly effective for code (identifiers match literally).
// resolveEmbedding() picks provider when a key exists, else tfidf.

const DIMS = 512;
const cache = new Map(); // sha1(text) → vector

function tokenize(text) {
  return String(text || '').toLowerCase().match(/[a-z_][a-z0-9_]{1,40}|[0-9]+(?:\.[0-9]+)+/g) || [];
}

function hashToken(tok) {
  return parseInt(crypto.createHash('sha1').update(tok).digest('hex').slice(0, 8), 16) % DIMS;
}

export function tfidfEmbed(texts) {
  const arr = Array.isArray(texts) ? texts : [texts];
  return arr.map((text) => {
    const key = `tfidf:${crypto.createHash('sha1').update(String(text)).digest('hex')}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const vec = new Array(DIMS).fill(0);
    const counts = new Map();
    for (const tok of tokenize(text)) counts.set(tok, (counts.get(tok) || 0) + 1);
    for (const [tok, n] of counts) vec[hashToken(tok)] += 1 + Math.log(n);
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
    const out = vec.map((v) => v / norm);
    cache.set(key, out);
    return out;
  });
}

export function embeddingMode(requested) {
  const want = (requested || process.env.RAG_EMBEDDING || 'auto').toLowerCase().trim();
  if (want === 'tfidf' || want === 'local') return { mode: 'tfidf' };
  if (want === 'provider') return { mode: 'provider' };
  // auto: provider only where the API actually serves embeddings
  for (const id of ['openai', 'openrouter', 'gemini', 'custom']) {
    try {
      const cfg = getProviderConfig(id);
      if (cfg.configured) {
        if (id === 'custom' && !/embed/i.test(process.env.CUSTOM_BASE_URL || '') && !process.env.CUSTOM_EMBED_URL) {
          continue; // chat-only custom server — stay local
        }
        return { mode: 'provider', provider: id };
      }
    } catch { /* unknown id */ }
  }
  return { mode: 'tfidf' };
}

export async function embed(texts, opts = {}) {
  let sel = opts.mode ? { mode: opts.mode, provider: opts.provider } : embeddingMode();
  if (sel.mode === 'provider' && !sel.provider) sel = embeddingMode(); // resolve auto
  if (sel.mode === 'provider' && !sel.provider) sel = { mode: 'tfidf' }; // no key → local
  if (sel.mode === 'provider') {
    try {
      return await embedViaProvider(texts, sel.provider, opts.fetchImpl);
    } catch (err) {
      logger.warn(`Provider embeddings failed (${err.message}) — falling back to local tfidf`);
      return { vectors: tfidfEmbed(texts), mode: 'tfidf', model: 'hashed-tfidf-512' };
    }
  }
  return { vectors: tfidfEmbed(texts), mode: 'tfidf', model: 'hashed-tfidf-512' };
}

async function embedViaProvider(texts, providerId, fetchImpl = fetch) {
  const arr = (Array.isArray(texts) ? texts : [texts]).map(String);
  if (providerId === 'gemini') return embedGemini(arr, fetchImpl);
  return embedOpenAICompat(arr, providerId, fetchImpl);
}

function openAIEmbedConfig(providerId) {
  const cfg = getProviderConfig(providerId);
  const model =
    process.env[`${providerId.toUpperCase()}_EMBED_MODEL`] ||
    (providerId === 'openai' ? 'text-embedding-3-small' : cfg.model);
  let url = cfg.baseUrl.replace(/\/chat\/completions\/?$/, '/embeddings');
  if (providerId === 'custom' && process.env.CUSTOM_EMBED_URL) url = process.env.CUSTOM_EMBED_URL;
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` };
  if (providerId === 'openrouter') {
    headers['HTTP-Referer'] = process.env.OPENROUTER_SITE_URL || 'http://localhost:3000';
    headers['X-Title'] = process.env.OPENROUTER_APP_NAME || 'Catalyst';
  }
  return { url, headers, model, provider: providerId };
}

async function embedOpenAICompat(arr, providerId, fetchFn) {
  const { url, headers, model } = openAIEmbedConfig(providerId);
  const vectors = [];
  for (let i = 0; i < arr.length; i += 100) {
    const batch = arr.slice(i, i + 100);
    const res = await fetchFn(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, input: batch }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => res.statusText);
      throw new Error(`[embed:${providerId}] ${res.status}: ${String(body).slice(0, 300)}`);
    }
    const data = await res.json();
    for (const d of data.data || []) vectors.push(d.embedding);
  }
  if (vectors.length !== arr.length) throw new Error(`[embed:${providerId}] short response`);
  return { vectors, mode: 'provider', model, provider: providerId };
}

async function embedGemini(arr, fetchFn) {
  const cfg = getProviderConfig('gemini');
  const model = process.env.GEMINI_EMBED_MODEL || 'text-embedding-004';
  const vectors = [];
  for (const text of arr) {
    const url = `${cfg.baseUrl}/${encodeURIComponent(model)}:embedContent?key=${encodeURIComponent(cfg.apiKey)}`;
    const res = await fetchFn(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: { parts: [{ text }] } }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => res.statusText);
      throw new Error(`[embed:gemini] ${res.status}: ${String(body).slice(0, 300)}`);
    }
    const data = await res.json();
    vectors.push(data.embedding.values);
  }
  return { vectors, mode: 'provider', model, provider: 'gemini' };
}

export function clearEmbeddingCache() {
  cache.clear();
}

export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
