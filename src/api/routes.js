import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs-extra';
import { v4 as uuidv4 } from 'uuid';
import AdmZip from 'adm-zip';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { runMigration } from '../core/orchestrator.js';
import { listProviders, PROVIDERS } from '../core/providers.js';
import { saveMigration } from '../utils/db.js';
import { materializeUpload, isAllowedUpload, uploadAcceptHint, buildDownloadName, MAX_FILES } from '../utils/uploads.js';
import { logger } from '../utils/logger.js';

export const migrationJobs = new Map();
const JOB_TTL_MS = 2 * 60 * 60 * 1000; // 2h

const upload = multer({
  dest: 'public/uploads/',
  limits: { fileSize: 50 * 1024 * 1024, files: MAX_FILES }, // 50MB per file
  fileFilter: (req, file, cb) => {
    // filename = webkit relative path for folder uploads
    if (!isAllowedUpload(file.originalname)) {
      return cb(new Error(`Unsupported file "${path.basename(file.originalname)}" — ${uploadAcceptHint()}`));
    }
    cb(null, true);
  },
});

// Cost guard: caps Opus/provider spend per IP
export const migrateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many migration requests — please wait 15 minutes.' },
});

const migrateSchema = z.object({
  sourceVersion: z.string().min(1).max(60),
  targetVersion: z.string().min(1).max(60),
  migrationPath: z.string().max(120).optional(),
  provider: z.enum(['auto', ...Object.keys(PROVIDERS)]).optional(),
  model: z.string().max(200).optional(),
  // Parallel to files[]: webkit relative paths (multer keeps basename only)
  relpath: z.union([z.string().max(500), z.array(z.string().max(500)).max(MAX_FILES)]).optional(),
});

const router = Router();

// GET /api/providers — which AI providers are configured (no keys leaked)
router.get('/providers', (req, res) => {
  res.json({ providers: listProviders(), envDefault: process.env.AI_PROVIDER || 'auto' });
});

// POST /api/migrate — start Catalyst migration
// Accepts: one archive (.zip/.rar/.tar.gz) · loose files · whole folder (webkit paths)
router.post('/migrate', migrateLimiter, upload.array('repo', MAX_FILES), async (req, res) => {
  const staged = req.files || [];
  const cleanupStaged = () => Promise.all(staged.map((f) => fs.remove(f.path).catch(() => {})));
  try {
    const parsed = migrateSchema.safeParse(req.body);
    if (!parsed.success) {
      await cleanupStaged();
      return res.status(400).json({ error: 'Invalid parameters', details: parsed.error.flatten().fieldErrors });
    }
    const { sourceVersion, targetVersion, migrationPath, provider, model, relpath } = parsed.data;
    if (staged.length === 0) {
      return res.status(400).json({ error: 'Missing repo files (field name: repo)' });
    }
    const relArr = Array.isArray(relpath) ? relpath : (typeof relpath === 'string' ? [relpath] : []);
    const stagedNames = staged.map((f, i) => relArr[i] || f.originalname);

    const jobId = uuidv4();
    migrationJobs.set(jobId, {
      id: jobId,
      status: 'queued',
      progress: 0,
      sourceVersion,
      targetVersion,
      migrationPath: migrationPath || `${sourceVersion}-to-${targetVersion}`,
      provider: (provider || process.env.AI_PROVIDER || 'auto').toLowerCase(),
      model: (model || '').trim() || null,
      uploadPath: staged.length === 1 ? staged[0].path : null, // multi-file jobs stage straight to extract dir
      stagedPaths: staged.map((f) => f.path),
      stagedNames,
      originalName: staged.length === 1 ? staged[0].originalname : `${staged.length} files`,
      createdAt: new Date(),
      error: null,
    });

    // Fire-and-forget async migration
    runMigrationAsync(jobId).catch((err) => {
      const job = migrationJobs.get(jobId);
      if (job) {
        job.status = 'failed';
        job.error = err.message;
        logger.error(`Migration failed: ${err.message}`, jobId);
        saveMigration(job).catch(() => {});
      }
    });

    res.json({ jobId, status: 'queued' });
  } catch (error) {
    logger.error(error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/migration/:id — job status
router.get('/migration/:id', (req, res) => {
  const job = migrationJobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  // Don't leak absolute server paths
  const { uploadPath, extractPath, stagedPaths, stagedNames, ...safe } = job;
  void uploadPath; void extractPath; void stagedPaths; void stagedNames;
  res.json(safe);
});

// GET /api/migration/:id/results — results when completed
router.get('/migration/:id/results', (req, res) => {
  const job = migrationJobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'completed') {
    return res.status(400).json({ error: `Migration not completed (status: ${job.status})` });
  }
  res.json({
    diffs: job.diffs,
    testResults: job.testResults,
    confidence: job.confidence,
    confidenceBreakdown: job.confidenceBreakdown || null,
    changedFiles: job.changedFiles,
    renames: job.renames || [],
    plan: job.plan,
    retries: job.retries ?? 0,
    offline: job.offline ?? false,
    provider: job.providerUsed || job.provider || null,
    model: job.modelUsed || job.model || null,
  });
});

// GET /api/migration/:id/download — migrated code as .zip
router.get('/migration/:id/download', async (req, res) => {
  const job = migrationJobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'completed') {
    return res.status(400).json({ error: `Migration not completed (status: ${job.status})` });
  }
  try {
    const zip = new AdmZip();
    zip.addLocalFolder(job.extractPath);
    const buf = zip.toBuffer();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${buildDownloadName(job)}"`);
    res.send(buf);
  } catch (err) {
    logger.error(`Download failed: ${err.message}`, job.id);
    res.status(500).json({ error: 'Failed to package download' });
  }
});

// DELETE /api/migration/:id — cleanup job + files
router.delete('/migration/:id', async (req, res) => {
  const job = migrationJobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  await cleanupJob(job);
  migrationJobs.delete(req.params.id);
  res.json({ deleted: req.params.id });
});

// Multer/file errors → clean JSON (must be after routes that use upload)
router.use((err, req, res, next) => {
  if (!err) return next();
  for (const f of req.files || []) fs.remove(f.path).catch(() => {});
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'File too large (max 50MB per file)' });
  if (err.code === 'LIMIT_FILE_COUNT') return res.status(400).json({ error: `Too many files (max ${MAX_FILES})` });
  return res.status(400).json({ error: err.message || 'Upload failed' });
});

async function cleanupJob(job) {
  if (job.uploadPath) await fs.remove(job.uploadPath).catch(() => {});
  for (const p of job.stagedPaths || []) await fs.remove(p).catch(() => {});
  if (job.extractPath) await fs.remove(job.extractPath).catch(() => {});
}

// Expire old jobs + their files every 10 min
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of migrationJobs) {
    const ts = new Date(job.updatedAt || job.createdAt || 0).getTime();
    if (now - ts > JOB_TTL_MS) {
      cleanupJob(job).catch(() => {});
      migrationJobs.delete(id);
      logger.info(`Expired job ${id}`);
    }
  }
}, 10 * 60 * 1000).unref?.();

async function runMigrationAsync(jobId) {
  const job = migrationJobs.get(jobId);
  if (!job) throw new Error('Job not found');

  const update = (patch) => Object.assign(job, patch, { updatedAt: new Date() });
  update({ status: 'analyzing', progress: 5 });

  // 1. Stage upload (archive / single file / loose files / folder) to a working dir
  const extractPath = path.join('public', 'uploads', `${jobId}-extracted`);
  await fs.ensureDir(extractPath);
  job.extractPath = extractPath;
  const staged = (job.stagedPaths || []).map((p, i) => ({
    path: p,
    // originalname isn't persisted per-file; single-file case keeps it, multi uses index
    originalname: job.stagedNames?.[i] || path.basename(p),
  }));
  const layout = await materializeUpload(staged, extractPath);
  // Multer temp files are copied — remove them now
  for (const p of job.stagedPaths || []) await fs.remove(p).catch(() => {});
  job.stagedPaths = [];
  update({ uploadMode: layout.mode, stagedFiles: layout.fileCount });
  logger.info(`Staged ${job.originalName} → ${extractPath} (${layout.mode}, ${layout.fileCount} files)`, jobId);

  // 2. Run orchestrator (it pushes analyzing/planning/executing/validating/completed)
  const result = await runMigration(
    extractPath,
    job.sourceVersion,
    job.targetVersion,
    jobId,
    (patch) => update(patch),
    { migrationPath: job.migrationPath, provider: job.provider, model: job.model }
  );

  update({
    status: 'completed',
    progress: 100,
    completedAt: new Date(),
    plan: result.plan,
    diffs: result.diffs,
    testResults: result.testResults,
    confidence: result.confidence,
    confidenceBreakdown: result.confidenceBreakdown,
    renames: result.renames || [],
    changedFiles: result.changedFiles,
    retries: result.retries,
    offline: result.offline,
    providerUsed: result.provider,
    modelUsed: result.model,
  });
  saveMigration(migrationJobs.get(jobId)).catch(() => {});
  logger.info(`Migration completed (${result.changedFiles?.length ?? 0} files)`, jobId);
}

export default router;
