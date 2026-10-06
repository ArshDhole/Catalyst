// Catalyst DB layer — Postgres when DATABASE_URL is set, in-memory otherwise.
// Week-2 persistence without breaking local dev (no DB required).
import { logger } from './logger.js';

let pool = null;
let useDb = false;

export async function initDb() {
  if (!process.env.DATABASE_URL) {
    logger.info('DATABASE_URL not set — using in-memory job store');
    return null;
  }
  try {
    const { Pool } = await import('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    await pool.query('SELECT 1');
    useDb = true;
    logger.info('✓ Connected to Postgres');
    return pool;
  } catch (err) {
    logger.warn(`Postgres unavailable (${err.message}) — falling back to memory`);
    pool = null;
    useDb = false;
    return null;
  }
}

export function isDbEnabled() {
  return useDb && !!pool;
}

export async function saveMigration(job) {
  if (!isDbEnabled()) return;
  try {
    await pool.query(
      `INSERT INTO migrations (id, status, sourceVersion, targetVersion, uploadPath, confidence, createdAt, completedAt, errorMessage)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET status=$2, confidence=$6, completedAt=$8, errorMessage=$9`,
      [job.id, job.status, job.sourceVersion, job.targetVersion, job.uploadPath || null,
       job.confidence ?? null, job.createdAt || new Date(), job.completedAt || null, job.error || null]
    );
  } catch (err) {
    logger.warn(`DB save failed: ${err.message}`);
  }
}

export async function closeDb() {
  if (pool) await pool.end().catch(() => {});
}
