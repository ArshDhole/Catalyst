import { cosine } from './embeddings.js';

/**
 * Minimal in-memory vector store. Cosine top-K over { id, vector, meta }.
 * Deliberately dependency-free — pgvector can replace this later.
 */
export function createStore() {
  const items = [];
  return {
    get size() {
      return items.length;
    },
    add(id, vector, meta = {}) {
      items.push({ id, vector, meta });
    },
    addMany(entries) {
      for (const e of entries) items.push(e);
    },
    search(queryVector, topK = 8) {
      return items
        .map((it) => ({ ...it, score: cosine(queryVector, it.vector) }))
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
    },
    clear() {
      items.length = 0;
    },
  };
}
