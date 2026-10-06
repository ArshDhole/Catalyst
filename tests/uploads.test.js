import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import {
  isArchiveName, isAllowedUpload, sanitizeRel, materializeUpload,
} from '../src/utils/uploads.js';

describe('uploads helpers', () => {
  it('classifies archives incl. rar', () => {
    assert.equal(isArchiveName('repo.zip'), true);
    assert.equal(isArchiveName('repo.rar'), true);
    assert.equal(isArchiveName('repo.tar.gz'), true);
    assert.equal(isArchiveName('repo.tgz'), true);
    assert.equal(isArchiveName('main.py'), false);
  });

  it('allows code/meta files, rejects executables', () => {
    for (const f of ['main.py', 'app.jsx', 'notes.md', 'Gemfile', 'Dockerfile', 'package.json', 'repo.zip', 'repo.rar']) {
      assert.equal(isAllowedUpload(f), true, f);
    }
    for (const f of ['evil.exe', 'lib.dll', 'photo.png', 'movie.mp4']) {
      assert.equal(isAllowedUpload(f), false, f);
    }
  });

  it('sanitizes relative paths', () => {
    assert.equal(sanitizeRel('pkg/main.py'), path.join('pkg', 'main.py'));
    assert.equal(sanitizeRel('../evil.py'), 'evil.py');
    assert.equal(sanitizeRel('/abs/x.py'), path.join('abs', 'x.py'));
    assert.equal(sanitizeRel(''), null);
    assert.ok(!sanitizeRel('a/../../b.py').includes('..'));
  });

  describe('materializeUpload', () => {
    let tmp;
    before(async () => { tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'catalyst-up-')); });
    after(async () => { await fs.remove(tmp); });

    it('stages a single loose file', async () => {
      const src = path.join(tmp, 'up-main.py');
      await fs.writeFile(src, 'print "hi"\n');
      const dest = path.join(tmp, 'dest-single');
      const r = await materializeUpload([{ path: src, originalname: 'main.py' }], dest);
      assert.equal(r.mode, 'single');
      assert.ok(await fs.pathExists(path.join(dest, 'main.py')));
    });

    it('stages folder-style multi upload preserving tree', async () => {
      const a = path.join(tmp, 'up-a.py');
      const b = path.join(tmp, 'up-b.py');
      await fs.writeFile(a, 'print "a"\n');
      await fs.writeFile(b, 'x = 1\n');
      const dest = path.join(tmp, 'dest-multi');
      const r = await materializeUpload([
        { path: a, originalname: 'pkg/main.py' },
        { path: b, originalname: 'pkg/util.py' },
      ], dest);
      assert.equal(r.mode, 'multi');
      assert.equal(r.fileCount, 2);
      assert.ok(await fs.pathExists(path.join(dest, 'pkg', 'main.py')));
      assert.ok(await fs.pathExists(path.join(dest, 'pkg', 'util.py')));
    });
  });
});
