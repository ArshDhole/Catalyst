import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { renameForTarget, applyTargetRenames } from '../src/executors/codeExecutor.js';

describe('renameForTarget', () => {
  it('swaps full version tokens (test.python2 → test.python3)', () => {
    assert.equal(renameForTarget('test.python2', 'python2', 'python3'), 'test.python3');
  });

  it('swaps short aliases (app_py2.py → app_py3.py)', () => {
    assert.equal(renameForTarget('app_py2.py', 'python2', 'python3'), 'app_py3.py');
  });

  it('keeps dotted targets dotted (mod-py36.py → mod-py311.py)', () => {
    assert.equal(renameForTarget('mod-py36.py', 'python3.6', 'python3.11'), 'mod-py311.py');
    assert.equal(renameForTarget('mod.python3.6.py', 'python3.6', 'python3.11'), 'mod.python3.11.py');
  });

  it('handles js/java/rails/node tokens', () => {
    assert.equal(renameForTarget('app.es5.js', 'js-es5', 'js-es2020'), 'app.es2020.js');
    assert.equal(renameForTarget('Main.java8', 'java8', 'java21'), 'Main.java21');
    assert.equal(renameForTarget('app_rails4.rb', 'rails4', 'rails7'), 'app_rails7.rb');
    assert.equal(renameForTarget('srv-node10.js', 'node10', 'node20'), 'srv-node20.js');
  });

  it('handles word migrations (util.cjs → util.esm)', () => {
    assert.equal(renameForTarget('util.cjs', 'commonjs', 'esm'), 'util.esm');
  });

  it('leaves ordinary names alone', () => {
    assert.equal(renameForTarget('main.py', 'python2', 'python3'), null);
    assert.equal(renameForTarget('myclass.py', 'react-class', 'react-hooks'), null);
    assert.equal(renameForTarget('hooks.ts', 'react-class', 'react-hooks'), null);
  });
});

describe('applyTargetRenames', () => {
  let tmp;
  before(async () => { tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'catalyst-ren-')); });
  after(async () => { await fs.remove(tmp); });

  it('renames on disk and skips collisions', async () => {
    await fs.writeFile(path.join(tmp, 'legacy.python2'), 'print "x"\n');
    await fs.writeFile(path.join(tmp, 'clash.python2'), 'print "y"\n');
    await fs.writeFile(path.join(tmp, 'clash.python3'), 'print("y")\n');
    await fs.writeFile(path.join(tmp, 'plain.py'), 'x = 1\n');
    const { renames } = await applyTargetRenames(tmp, 'python2', 'python3');
    assert.equal(renames.length, 1);
    assert.deepEqual(renames[0].from.replace(/\\/g, '/'), 'legacy.python2');
    assert.deepEqual(renames[0].to.replace(/\\/g, '/'), 'legacy.python3');
    assert.ok(await fs.pathExists(path.join(tmp, 'legacy.python3')));
    assert.ok(await fs.pathExists(path.join(tmp, 'clash.python2')), 'collision must not overwrite');
  });
});
