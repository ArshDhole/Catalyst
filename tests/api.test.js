import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'child_process';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';

const PORT = 3211;
const BASE = `http://localhost:${PORT}`;
let server;

async function waitForHealth(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('server did not become healthy');
}

before(async () => {
  server = spawn('node', ['src/server.js'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'pipe',
  });
  await waitForHealth();
});

after(async () => {
  server?.kill('SIGTERM');
});

describe('Catalyst API (offline, no key)', () => {
  it('health + providers endpoints', async () => {
    const h = await (await fetch(`${BASE}/api/health`)).json();
    assert.equal(h.status, 'ok');
    const p = await (await fetch(`${BASE}/api/providers`)).json();
    assert.ok(Array.isArray(p.providers) && p.providers.length >= 6);
    assert.ok(!JSON.stringify(p).includes('sk-'));
  });

  it('rejects auto provider with a request key (ambiguous)', async () => {
    const fd = new FormData();
    fd.append('sourceVersion', 'python2');
    fd.append('targetVersion', 'python3');
    fd.append('provider', 'auto');
    fd.append('apiKey', 'sk-test-123');
    fd.append('repo', new Blob(['print "x"\n']), 'main.py');
    const r = await fetch(`${BASE}/api/migrate`, { method: 'POST', body: fd });
    assert.equal(r.status, 400);
  });

  it('accepts a per-request key and never leaks it', async () => {
    const fd = new FormData();
    fd.append('sourceVersion', 'python2');
    fd.append('targetVersion', 'python3');
    fd.append('provider', 'openai');
    fd.append('apiKey', 'sk-bogus-key-for-leak-test');
    fd.append('repo', new Blob(['print "x"\n']), 'main.py');
    const start = await (await fetch(`${BASE}/api/migrate`, { method: 'POST', body: fd })).json();
    assert.ok(start.jobId);
    // Key is accepted; bogus key fails at the provider (or offline network) — never offline.
    const job = await pollJob(start.jobId, 60);
    assert.equal(job.status, 'failed');
    assert.equal(job.byok, true);
    assert.ok(!JSON.stringify(job).includes('sk-bogus-key-for-leak-test'), 'key leaked in status');
    const res = await fetch(`${BASE}/api/migration/${start.jobId}/results`);
    const body = await res.text();
    assert.ok(!body.includes('sk-bogus-key-for-leak-test'), 'key leaked in results');
    await fetch(`${BASE}/api/migration/${start.jobId}`, { method: 'DELETE' });
  }, { timeout: 90000 });

  it('rejects bad upload type with clean 400', async () => {
    const fd = new FormData();
    fd.append('sourceVersion', 'python2');
    fd.append('targetVersion', 'python3');
    fd.append('repo', new Blob(['hi'], { type: 'application/octet-stream' }), 'evil.exe');
    const r = await fetch(`${BASE}/api/migrate`, { method: 'POST', body: fd });
    assert.equal(r.status, 400);
  });

  it('full offline migration: upload → poll → results → download → delete', async () => {
    // Build a tiny Python2 repo zip
    const { default: AdmZip } = await import('adm-zip');
    const zip = new AdmZip();
    zip.addFile('main.py', Buffer.from('print "Hello"\nx = raw_input("name: ")\n'));
    const tmpZip = path.join(os.tmpdir(), `catalyst-e2e-${Date.now()}.zip`);
    zip.writeZip(tmpZip);

    const fd = new FormData();
    fd.append('sourceVersion', 'python2');
    fd.append('targetVersion', 'python3');
    fd.append('repo', new Blob([await fs.readFile(tmpZip)], { type: 'application/zip' }), 'repo.zip');
    const start = await (await fetch(`${BASE}/api/migrate`, { method: 'POST', body: fd })).json();
    assert.ok(start.jobId);
    await fs.remove(tmpZip);

    // Poll for completion (offline rules = fast)
    let job;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      job = await (await fetch(`${BASE}/api/migration/${start.jobId}`)).json();
      if (job.status === 'completed' || job.status === 'failed') break;
    }
    assert.equal(job.status, 'completed', `job failed: ${job.error}`);
    assert.ok((job.changedFiles || []).length >= 1);

    const results = await (await fetch(`${BASE}/api/migration/${start.jobId}/results`)).json();
    assert.equal(results.offline, true);
    assert.ok(Array.isArray(results.diffs) && results.diffs.length >= 1);
    assert.ok(results.diffs[0].patch.includes('print('));
    assert.ok(results.confidence > 0.9, `confidence too low: ${results.confidence}`);
    assert.ok(results.confidenceBreakdown, 'missing confidence breakdown');

    const dl = await fetch(`${BASE}/api/migration/${start.jobId}/download`);
    assert.equal(dl.status, 200);
    assert.ok(dl.headers.get('content-type').includes('zip'));
    assert.ok((await dl.arrayBuffer()).byteLength > 100);
    assert.ok(
      (dl.headers.get('content-disposition') || '').includes('repo-python3.zip'),
      `bad download name: ${dl.headers.get('content-disposition')}`
    );

    const del = await (await fetch(`${BASE}/api/migration/${start.jobId}`, { method: 'DELETE' })).json();
    assert.equal(del.deleted, start.jobId);
  }, { timeout: 90000 });

  it('renames versioned filenames end to end (legacy.python2 → legacy.python3)', async () => {
    const { default: AdmZip } = await import('adm-zip');
    const zip = new AdmZip();
    zip.addFile('legacy.python2', Buffer.from('print "Hello"\n'));
    const fd = new FormData();
    fd.append('sourceVersion', 'python2');
    fd.append('targetVersion', 'python3');
    fd.append('repo', new Blob([zip.toBuffer()], { type: 'application/zip' }), 'test.zip');
    const start = await (await fetch(`${BASE}/api/migrate`, { method: 'POST', body: fd })).json();
    const job = await pollJob(start.jobId);
    assert.equal(job.status, 'completed', `job failed: ${job.error}`);
    const results = await (await fetch(`${BASE}/api/migration/${start.jobId}/results`)).json();
    assert.equal(results.renames.length, 1);
    assert.ok(results.renames[0].to.replace(/\\/g, '/').endsWith('legacy.python3'));
    assert.ok(results.changedFiles.some((f) => f.replace(/\\/g, '/').endsWith('legacy.python3')));
    assert.ok(results.diffs.some((d) => d.file.replace(/\\/g, '/').endsWith('legacy.python3')));
    const dl = await fetch(`${BASE}/api/migration/${start.jobId}/download`);
    assert.ok((dl.headers.get('content-disposition') || '').includes('test-python3.zip'));
    await fetch(`${BASE}/api/migration/${start.jobId}`, { method: 'DELETE' });
  }, { timeout: 90000 });

  async function pollJob(jobId, timeoutS = 40) {
    for (let i = 0; i < timeoutS; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const job = await (await fetch(`${BASE}/api/migration/${jobId}`)).json();
      if (job.status === 'completed' || job.status === 'failed') return job;
    }
    throw new Error('job timed out');
  }

  it('migrates a single loose .py file (no archive)', async () => {
    const fd = new FormData();
    fd.append('sourceVersion', 'python2');
    fd.append('targetVersion', 'python3');
    fd.append('repo', new Blob(['print "solo"\n']), 'main.py');
    const start = await (await fetch(`${BASE}/api/migrate`, { method: 'POST', body: fd })).json();
    assert.ok(start.jobId);
    const job = await pollJob(start.jobId);
    assert.equal(job.status, 'completed', `job failed: ${job.error}`);
    assert.equal(job.uploadMode, 'single');
    assert.ok((job.changedFiles || []).length >= 1);
    await fetch(`${BASE}/api/migration/${start.jobId}`, { method: 'DELETE' });
  }, { timeout: 90000 });

  it('migrates folder-style multi-file upload preserving tree', async () => {
    const fd = new FormData();
    fd.append('sourceVersion', 'python2');
    fd.append('targetVersion', 'python3');
    // relpath carries the tree position (servers keep basename only per part)
    fd.append('repo', new Blob(['print "a"\n']), 'main.py');
    fd.append('relpath', 'pkg/main.py');
    fd.append('repo', new Blob(['print "b"\n']), 'util.py');
    fd.append('relpath', 'pkg/util.py');
    const start = await (await fetch(`${BASE}/api/migrate`, { method: 'POST', body: fd })).json();
    assert.ok(start.jobId);
    const job = await pollJob(start.jobId);
    assert.equal(job.status, 'completed', `job failed: ${job.error}`);
    assert.equal(job.uploadMode, 'multi');
    assert.equal((job.changedFiles || []).length, 2);
    const results = await (await fetch(`${BASE}/api/migration/${start.jobId}/results`)).json();
    assert.ok(results.diffs.some((d) => d.file.includes('pkg')));
    await fetch(`${BASE}/api/migration/${start.jobId}`, { method: 'DELETE' });
  }, { timeout: 90000 });
});
