import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { chunkText, chunkRepo } from './chunker.js';
import { embed } from './embeddings.js';
import { createStore } from './vectorStore.js';
import { logger } from '../utils/logger.js';

const KB_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'knowledge');
const KB_BY_PATH = [
  [/^python2-to-python3$/, 'python2-to-3.md'],
  [/^(python3-upgrade|python36-to-python311)$/, 'python2-to-3.md'],
  [/^js-modernize$/, 'js-es5-modern.md'],
];

export const RAG_TOP_K = parseInt(process.env.RAG_TOP_K || '12', 10);
export const RAG_CONTEXT_CHARS = parseInt(process.env.RAG_CONTEXT_CHARS || '24000', 10);

/** Queries that surface the chunks a migration plan actually needs. */
export function planQueries(sourceVersion, targetVersion, analysis) {
  const langs = (analysis.files || []).slice(0, 8).map((f) => f.path).join(', ');
  return [
    `migrate ${sourceVersion} to ${targetVersion} deprecated API replacements`,
    `migrate ${sourceVersion} to ${targetVersion} import changes`,
    `test files validating migration behavior ${langs}`,
  ];
}

async function indexChunks(chunks, embedOpts) {
  const store = createStore();
  if (chunks.length === 0) return { store, mode: 'tfidf', model: 'none', count: 0 };
  const { vectors, mode, model } = await embed(chunks.map((c) => c.text), embedOpts);
  store.addMany(chunks.map((c, i) => ({ id: c.id, vector: vectors[i], meta: c })));
  return { store, mode, model, count: chunks.length };
}

async function loadKnowledge(pathId) {
  const names = ['playbook.md'];
  for (const [re, file] of KB_BY_PATH) {
    if (re.test(pathId || '')) {
      if (!names.includes(file)) names.splice(0, 0, file);
      break;
    }
  }
  const chunks = [];
  for (const name of names) {
    try {
      const text = await fs.readFile(path.join(KB_DIR, name), 'utf8');
      for (const c of chunkText(text, `knowledge/${name}`, { chunkLines: 40, overlap: 8 })) {
        chunks.push({ ...c, kb: true });
      }
    } catch (err) {
      logger.warn(`Knowledge doc missing: ${name}`);
    }
  }
  return chunks;
}

/**
 * Build repo + knowledge indexes once per job, then answer queries.
 * Returns { ask(queries, topK), stats } — ask() merges repo + KB hits.
 */
export async function buildRetriever(repoPath, pathId, embedOpts = {}) {
  const [repoChunks, kbChunks] = await Promise.all([
    chunkRepo(repoPath),
    loadKnowledge(pathId),
  ]);
  const [repoIdx, kbIdx] = await Promise.all([
    indexChunks(repoChunks, embedOpts),
    indexChunks(kbChunks, embedOpts),
  ]);
  const mode = repoIdx.mode === 'provider' || kbIdx.mode === 'provider' ? 'provider' : repoIdx.mode;
  logger.info(`RAG index: ${repoIdx.count} repo chunks + ${kbIdx.count} KB chunks (${mode})`);

  async function ask(queries, { topK = RAG_TOP_K, maxChars = RAG_CONTEXT_CHARS, kbTopK = 4 } = {}) {
    const qs = Array.isArray(queries) ? queries : [queries];
    const { vectors } = await embed(qs, embedOpts);
    const seen = new Map();
    const take = (hits, cap) => {
      for (const h of hits.slice(0, cap)) {
        if (!seen.has(h.id)) seen.set(h.id, h);
        else if (h.score > seen.get(h.id).score) seen.set(h.id, h);
      }
    };
    for (const qv of vectors) {
      take(repoIdx.store.search(qv, topK), topK);
      take(kbIdx.store.search(qv, kbTopK), kbTopK);
    }
    const ranked = [...seen.values()].sort((a, b) => b.score - a.score);
    let chars = 0;
    const picked = [];
    for (const h of ranked) {
      const block = `--- ${h.meta.file}:${h.meta.startLine}-${h.meta.endLine} ---\n${h.meta.text}`;
      if (chars + block.length > maxChars && picked.length > 0) break;
      picked.push(h);
      chars += block.length;
    }
    const context = picked
      .map((h) => `--- ${h.meta.file}:${h.meta.startLine}-${h.meta.endLine} ---\n${h.meta.text}`)
      .join('\n\n');
    return {
      context,
      picked: picked.map((h) => ({
        file: h.meta.file, startLine: h.meta.startLine, endLine: h.meta.endLine,
        score: Math.round(h.score * 1000) / 1000, kb: !!h.meta.kb,
      })),
      stats: { chunks: repoIdx.count, kbChunks: kbIdx.count, used: picked.length, chars, mode },
    };
  }

  const api = {
    ask,
    stats: { chunks: repoIdx.count, kbChunks: kbIdx.count, mode, model: repoIdx.model },
    lastAsk: null,
  };

  const innerAsk = api.ask;
  api.ask = async (...args) => {
    const res = await innerAsk(...args);
    api.lastAsk = res.stats;
    return res;
  };
  return api;
}
