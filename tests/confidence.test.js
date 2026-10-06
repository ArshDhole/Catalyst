import { describe, it } from 'node:test';
import assert from 'node:assert';
import { scoreConfidence, CONFIDENCE_CAP } from '../src/utils/confidence.js';
import { buildDownloadName } from '../src/utils/uploads.js';

describe('scoreConfidence', () => {
  it('clean offline run scores in the 90s, not the 80s', () => {
    const r = scoreConfidence({ planConfidence: 0.88, attempted: 10, applied: 10, testsPassed: true });
    assert.ok(r.score >= 0.9, `got ${r.score}`);
    assert.ok(r.score <= CONFIDENCE_CAP);
  });

  it('missed patterns drag the score down', () => {
    const good = scoreConfidence({ planConfidence: 0.88, attempted: 10, applied: 10, testsPassed: true });
    const bad = scoreConfidence({ planConfidence: 0.88, attempted: 10, applied: 4, testsPassed: true });
    assert.ok(bad.score < good.score);
  });

  it('failed tests drag the score down', () => {
    const good = scoreConfidence({ planConfidence: 0.9, attempted: 5, applied: 5, testsPassed: true });
    const bad = scoreConfidence({ planConfidence: 0.9, attempted: 5, applied: 5, testsPassed: false });
    assert.ok(bad.score < good.score);
  });

  it('never exceeds the cap', () => {
    const r = scoreConfidence({ planConfidence: 1, attempted: 100, applied: 100, testsPassed: true });
    assert.ok(r.score <= CONFIDENCE_CAP);
  });

  it('returns a breakdown that sums to the story', () => {
    const r = scoreConfidence({ planConfidence: 0.88, attempted: 10, applied: 10, testsPassed: true });
    assert.deepEqual(Object.keys(r.breakdown).sort(), ['application', 'plan', 'tests']);
  });
});

describe('buildDownloadName', () => {
  it('names single uploads after the target version', () => {
    assert.equal(
      buildDownloadName({ originalName: 'test.zip', sourceVersion: 'python2', targetVersion: 'python3' }),
      'test-python3.zip'
    );
  });

  it('strips archive extensions before suffixing', () => {
    assert.equal(
      buildDownloadName({ originalName: 'repo.tar.gz', sourceVersion: 'java8', targetVersion: 'java21' }),
      'repo-java21.zip'
    );
  });

  it('names folder uploads after the migration path', () => {
    assert.equal(
      buildDownloadName({ originalName: '12 files', sourceVersion: 'python2', targetVersion: 'python3' }),
      'catalyst-python2-to-python3.zip'
    );
  });

  it('sanitizes hostile names', () => {
    const n = buildDownloadName({ originalName: '../../evil.zip', sourceVersion: 'a', targetVersion: 'b' });
    assert.ok(!n.includes('..') && !n.includes('/'));
    assert.ok(n.endsWith('.zip'));
  });
});
