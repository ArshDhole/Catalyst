import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { executeChanges, revertChanges } from '../src/executors/codeExecutor.js';
import { parseCodebase, detectLanguage } from '../src/parsers/codeParser.js';
import { generateOfflinePlan } from '../src/parsers/pythonParser.js';

let tmp;

before(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'catalyst-test-'));
  await fs.writeFile(path.join(tmp, 'main.py'), 'print "hello"\nname = raw_input("x")\n');
  await fs.writeFile(path.join(tmp, 'notes.txt'), 'ignore me');
});

after(async () => {
  await fs.remove(tmp);
});

describe('codeParser', () => {
  it('detects python from sourceVersion', () => {
    assert.equal(detectLanguage('python2'), 'python');
    assert.equal(detectLanguage('rails4'), 'ruby');
  });

  it('parses repo structure + imports', async () => {
    const a = await parseCodebase(tmp, 'python2');
    assert.ok(a.totalFiles >= 1);
    assert.equal(a.language, 'python');
    assert.ok(a.files.some((f) => f.path.endsWith('main.py')));
  });
});

describe('offline planner + executor', () => {
  it('offline plan finds edits for python2 file', async () => {
    const plan = await generateOfflinePlan(tmp, 'python2-to-python3', 'python2', 'python3');
    assert.equal(plan.offline, true);
    const changes = plan.phases[0].changes;
    assert.ok(changes.length >= 2);
    assert.ok(changes.some((c) => c.new.includes('print(')));
  });

  it('executor applies + reverts', async () => {
    const plan = await generateOfflinePlan(tmp, 'python2-to-python3', 'python2', 'python3');
    const res = await executeChanges(tmp, plan);
    assert.ok(res.changedFiles.length >= 1);
    const migrated = await fs.readFile(path.join(tmp, 'main.py'), 'utf8');
    assert.ok(migrated.includes('print("hello")'));
    await revertChanges(tmp, res.originalContent);
    const back = await fs.readFile(path.join(tmp, 'main.py'), 'utf8');
    assert.ok(back.includes('print "hello"'));
  });

  it('executor skips missing files without crashing', async () => {
    const res = await executeChanges(tmp, {
      phases: [{ changes: [{ file: 'nope.py', old: 'a', new: 'b' }] }],
    });
    assert.equal(res.changes[0].status, 'skipped-missing');
  });
});
