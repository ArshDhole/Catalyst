import { describe, it } from 'node:test';
import assert from 'node:assert';
import { resolveProvider, listProviders, complete, hasAnyKey } from '../src/core/providers.js';

function clearKeys() {
  for (const k of [
    'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY',
    'OPENROUTER_API_KEY', 'ZEN_API_KEY', 'OPENCODE_ZEN_API_KEY', 'CUSTOM_API_KEY',
    'AI_PROVIDER', 'MODEL',
  ]) delete process.env[k];
}

describe('providers', () => {
  it('auto with no keys throws offline-friendly error', () => {
    clearKeys();
    assert.equal(hasAnyKey(), false);
    assert.throws(() => resolveProvider(), /No AI API key/);
  });

  it('listProviders never leaks keys', () => {
    clearKeys();
    process.env.OPENAI_API_KEY = 'sk-test-12345';
    const list = listProviders();
    assert.equal(list.find((p) => p.id === 'openai').configured, true);
    assert.ok(!JSON.stringify(list).includes('sk-test-12345'));
    delete process.env.OPENAI_API_KEY;
  });

  it('explicit provider + model override wins', () => {
    clearKeys();
    process.env.OPENAI_API_KEY = 'sk-test';
    const r = resolveProvider('openai', 'gpt-4o-mini');
    assert.equal(r.id, 'openai');
    assert.equal(r.model, 'gpt-4o-mini');
    delete process.env.OPENAI_API_KEY;
  });

  it('AI_PROVIDER env selects provider', () => {
    clearKeys();
    process.env.GEMINI_API_KEY = 'g-test';
    process.env.AI_PROVIDER = 'gemini';
    const r = resolveProvider();
    assert.equal(r.id, 'gemini');
    delete process.env.GEMINI_API_KEY;
    delete process.env.AI_PROVIDER;
  });

  it('complete() parses OpenAI-chat shape (stubbed)', async () => {
    clearKeys();
    process.env.OPENAI_API_KEY = 'sk-test';
    const stub = async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"strategy":"t"}' } }] }),
    });
    const out = await complete({ system: 's', user: 'u', provider: 'openai', model: 'gpt-4o-mini', fetchImpl: stub });
    assert.equal(out.text, '{"strategy":"t"}');
    assert.equal(out.provider, 'openai');
    delete process.env.OPENAI_API_KEY;
  });

  it('complete() parses Gemini shape (stubbed)', async () => {
    clearKeys();
    process.env.GEMINI_API_KEY = 'g-test';
    const stub = async () => ({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'hi' }] } }] }),
    });
    const out = await complete({ system: 's', user: 'u', provider: 'gemini', fetchImpl: stub });
    assert.equal(out.text, 'hi');
    delete process.env.GEMINI_API_KEY;
  });

  it('complete() surfaces provider + status on error', async () => {
    clearKeys();
    process.env.OPENAI_API_KEY = 'sk-test';
    const stub = async () => ({ ok: false, status: 401, text: async () => 'bad key' });
    await assert.rejects(
      complete({ system: 's', user: 'u', provider: 'openai', fetchImpl: stub }),
      /\[openai\] 401/
    );
    delete process.env.OPENAI_API_KEY;
  });

  it('request key override works with no env key configured', () => {
    clearKeys();
    const r = resolveProvider('openai', 'gpt-4o-mini', 'sk-override-123');
    assert.equal(r.id, 'openai');
    assert.equal(r.model, 'gpt-4o-mini');
    assert.equal(r.apiKey, 'sk-override-123');
    assert.equal(r.configured, true);
  });

  it('override beats env key', () => {
    clearKeys();
    process.env.OPENAI_API_KEY = 'sk-env';
    const r = resolveProvider('openai', '', 'sk-override');
    assert.equal(r.apiKey, 'sk-override');
    assert.equal(r.fromRequest, true);
    delete process.env.OPENAI_API_KEY;
  });

  it('auto + request key is rejected as ambiguous', () => {
    clearKeys();
    assert.throws(() => resolveProvider('auto', '', 'sk-override'), /Pick a provider/);
  });

  it('rejects non-namespaced model IDs for OpenRouter locally', () => {
    clearKeys();
    assert.throws(
      () => resolveProvider('openrouter', 'claude-opus-4-20250805', 'sk-or-test'),
      /doesn't look like an OpenRouter ID/
    );
    const ok = resolveProvider('openrouter', 'anthropic/claude-opus-4.6', 'sk-or-test');
    assert.equal(ok.model, 'anthropic/claude-opus-4.6');
  });

  it('provider-specific model env beats generic MODEL', () => {
    clearKeys();
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.MODEL = 'generic-model';
    process.env.OPENAI_MODEL = 'gpt-4o-mini';
    const r = resolveProvider('openai');
    assert.equal(r.model, 'gpt-4o-mini');
    delete process.env.OPENAI_API_KEY;
    delete process.env.MODEL;
    delete process.env.OPENAI_MODEL;
  });

  it('complete() sends the override key, not the env key', async () => {
    clearKeys();
    process.env.OPENAI_API_KEY = 'sk-env';
    let seen;
    const stub = async (url, opts) => {
      seen = opts.headers.authorization;
      return { ok: true, json: async () => ({ choices: [{ message: { content: '{"a":1}' } }] }) };
    };
    await complete({ system: 's', user: 'u', provider: 'openai', apiKey: 'sk-override', fetchImpl: stub });
    assert.equal(seen, 'Bearer sk-override');
    delete process.env.OPENAI_API_KEY;
  });

  it('cleanKey strips invisible paste junk gateways reject', async () => {
    const { cleanKey, keyShapeHint } = await import('../src/core/providers.js');
    assert.equal(cleanKey('  sk-or-v1-abc\u200B\u00A0\n'), 'sk-or-v1-abc');
    assert.equal(cleanKey(''), '');
  });

  it('keyShapeHint flags wrong-shaped keys without leaking', async () => {
    const { keyShapeHint } = await import('../src/core/providers.js');
    const hint = keyShapeHint('openrouter', 'sk-bogus');
    assert.ok(hint.includes('sk-or-'));
    assert.ok(!hint.includes('sk-bogus'));
    assert.equal(keyShapeHint('openrouter', 'sk-or-v1-abc'), '');
    assert.equal(keyShapeHint('zen', 'anything'), '');
  });
});
