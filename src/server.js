import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs-extra';
import apiRoutes, { migrationJobs } from './api/routes.js';
import { listProviders } from './core/providers.js';
import { initDb, closeDb } from './utils/db.js';
import { logger } from './utils/logger.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

await fs.ensureDir('public/uploads');
await initDb();

app.get('/api/health', (req, res) => {
  const providers = listProviders().map((p) => ({ id: p.id, configured: p.configured }));
  res.json({
    app: process.env.APP_NAME || 'Catalyst',
    tagline: process.env.APP_TAGLINE || 'Transform legacy code into modern systems',
    status: 'ok',
    jobs: migrationJobs.size,
    aiProvider: process.env.AI_PROVIDER || 'auto',
    providers,
    time: new Date().toISOString(),
  });
});

app.use('/api', apiRoutes);

// 404 for unknown API routes
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  logger.info(`✓ Catalyst backend running on http://localhost:${PORT}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    logger.info(`Received ${sig} — shutting down`);
    server.close(() => {});
    await closeDb();
    process.exit(0);
  });
}

export { migrationJobs, app };
