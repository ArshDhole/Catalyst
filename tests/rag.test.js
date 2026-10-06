import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { chunkText, chunkRepo } from '../src/rag/chunker.js';
import { tfidfEmbed, cosine, embeddingMode, embed } from '../src/rag/embeddings.js';
import { createStore } from '../src/rag/vectorStore.js';
import { buildRetriever } from '../src/rag/retriever.js';

describe('chunker', () => {
  it('windows code with overlap and line metadata', () => {
    const text = Array.from({ length: 250 }, (_, i) => `line${i + 1} print "x${i}"`).join('\n');
    const chunks = chunkText(text, 'main.py', { chunkLines: 100, overlap: 20 });
    assert.equal(chunks.length, 3);
    assert.equal(chunks[0].startLine, 1);
    assert.equal(chunks[1].startLine, 81); // 100 - 20 overlap
    assert.ok(chunks[0].text.includes('line1'));
    assert.ok(chunks[2].text.includes('line250'));
  });

  it('skips blank windows', () => {
    assert.deepEqual(chunkText('', 'e.py'), []);
  });
});

describe('embeddings', () => {
  it('tfidf vectors are normalized and deterministic', () => {
    const [a, b] = tfidfEmbed(['print hello world', 'print hello world']);
    assert.deepEqual(a, b);
    const norm = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
    assert.ok(Math.abs(norm - 1) < 1e-9);
  });

  it('cosine ranks similar texts higher', () => {
    const [q, same, diff] = tfidfEmbed([
      'raw_input name prompt',
      'name = raw_input("name")',
      'completely unrelated giraffe quantum',
    ]);
    assert.ok(cosine(q, same) > cosine(q, diff));
  });

  it('auto mode is tfidf with no keys', () => {
    for (const k of ['OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'CUSTOM_API_KEY']) {
      delete process.env[k];
    }
    assert.equal(embeddingMode().mode, 'tfidf');
  });

  it('embed() falls back to tfidf when provider fails', async () => {
    process.env.OPENAI_API_KEY = 'sk-bogus';
    const r = await embed(['hello'], { mode: 'provider', provider: 'openai', fetchImpl: async () => ({ ok: false, status: 401, text: async () => 'nope' }) });
    assert.equal(r.mode, 'tfidf');
    delete process.env.OPENAI_API_KEY;
  });
});

describe('vectorStore', () => {
  it('top-K cosine search', () => {
    const s = createStore();
    const [a, b, c] = tfidfEmbed(['print statement python2 legacy', 'print loop range modern', 'baking sourdough bread']);
    s.add('a', a, {});
    s.add('b', b, {});
    s.add('c', c, {});
    const [q] = tfidfEmbed(['print python2 statement']);
    const hits = s.search(q, 2);
    assert.equal(hits.length, 2);
    assert.equal(hits[0].id, 'a');
    assert.ok(hits[0].score >= hits[1].score);
  });
});

describe('retriever', () => {
  let tmp;
  before(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'catalyst-rag-'));
    await fs.writeFile(path.join(tmp, 'main.py'), 'print "hello"\nname = raw_input("n: ")\n');
    await fs.writeFile(path.join(tmp, 'app.js'), 'var x = [1,2].indexOf(1);\n');
  });
  after(async () => { await fs.remove(tmp); });

  it('indexes repo + KB and retrieves within budget', async () => {
    const r = await buildRetriever(tmp, 'python2-to-python3');
    assert.ok(r.stats.chunks >= 2);
    assert.ok(r.stats.kbChunks >= 1);
    const res = await r.ask(['migrate python2 to python3 print raw_input'], { topK: 6, maxChars: 4000 });
    assert.ok(res.picked.length > 0);
    assert.ok(res.stats.chars <= 4000 + 2000); // chunk granularity
    assert.ok(res.context.includes('main.py') || res.context.includes('knowledge/'));
    assert.ok(res.picked.every((p) => typeof p.score === 'number'));
  });

  it('chunkRepo caps runaway repos', async () => {
    const chunks = await import('../src/rag/chunker.js').then((m) => m.chunkRepo(tmp));
    assert.ok(chunks.length >= 2 && chunks.length <= 800);
  });
});
