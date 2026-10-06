import { describe, it } from 'node:test';
import assert from 'node:assert';
import { applyRules, resolvePathId, rulesForPath, PYTHON2_TO_3_RULES } from '../src/parsers/migrationRules.js';
import { parseJsonFromModel } from '../src/core/orchestrator.js';

describe('migrationRules', () => {
  it('resolves python2→python3 path id', () => {
    assert.equal(resolvePathId('python2', 'python3'), 'python2-to-python3');
  });

  it('resolves 40+ UI paths to engine families', () => {
    assert.equal(resolvePathId('python3.7', 'python3.12'), 'python3-upgrade');
    assert.equal(resolvePathId('js-es5', 'js-es2024'), 'js-modernize');
    assert.equal(resolvePathId('node14', 'node20'), 'js-modernize');
    assert.equal(resolvePathId('commonjs', 'esm'), 'js-modernize');
    assert.equal(resolvePathId('ts4', 'ts5'), 'ts-upgrade');
    assert.equal(resolvePathId('react-class', 'react-hooks'), 'react-upgrade');
    assert.equal(resolvePathId('cra', 'vite'), 'react-upgrade');
    assert.equal(resolvePathId('vue2', 'vue3'), 'vue-upgrade');
    assert.equal(resolvePathId('angular12', 'angular17'), 'angular-upgrade');
    assert.equal(resolvePathId('rails6', 'rails7'), 'rails-upgrade');
    assert.equal(resolvePathId('django3', 'django4.2'), 'django-upgrade');
    assert.equal(resolvePathId('spring2', 'spring3'), 'spring-upgrade');
    assert.equal(resolvePathId('laravel8', 'laravel11'), 'laravel-upgrade');
    assert.equal(resolvePathId('java11', 'java17'), 'java-upgrade');
    assert.equal(resolvePathId('go1.16', 'go1.21'), 'go-upgrade');
    assert.equal(resolvePathId('netfx', 'net8'), 'net-upgrade');
    assert.equal(resolvePathId('php7.4', 'php8.3'), 'php-upgrade');
    assert.equal(resolvePathId('ruby2.7', 'ruby3.2'), 'ruby-upgrade');
  });

  it('resolves professional-UI ids to engine families', () => {
    assert.equal(resolvePathId('python36', 'python311'), 'python3-upgrade');
    assert.equal(resolvePathId('es5', 'es2024'), 'js-modernize');
    assert.equal(resolvePathId('cjs', 'esm'), 'js-modernize');
    assert.equal(resolvePathId('ts3x', 'ts5x'), 'ts-upgrade');
    assert.equal(resolvePathId('react-cra', 'react-vite'), 'react-upgrade');
    assert.equal(resolvePathId('vue-class', 'vue-composition'), 'vue-upgrade');
    assert.equal(resolvePathId('django2', 'django4'), 'django-upgrade');
    assert.equal(resolvePathId('springboot1', 'springboot3'), 'spring-upgrade');
    assert.equal(resolvePathId('go12', 'go120'), 'go-upgrade');
    assert.equal(resolvePathId('net-framework', 'net8'), 'net-upgrade');
    assert.equal(resolvePathId('net5', 'net8'), 'net-upgrade');
    assert.equal(resolvePathId('php74', 'php83'), 'php-upgrade');
    assert.equal(resolvePathId('ruby30', 'ruby32'), 'ruby-upgrade');
  });

  it('transforms print statement + raw_input + iteritems', () => {
    const src = 'print "hello"\nname = raw_input("name: ")\nfor k, v in d.iteritems():\n    print k\n';
    const { text, applied } = applyRules(src, PYTHON2_TO_3_RULES);
    assert.ok(text.includes('print("hello")'));
    assert.ok(text.includes('input('));
    assert.ok(text.includes('.items()'));
    assert.ok(applied.length >= 3);
  });

  it('rulesForPath returns empty for AI-only paths', () => {
    assert.deepEqual(rulesForPath('rails4-to-rails7'), []);
  });
});

describe('orchestrator helpers', () => {
  it('parseJsonFromModel strips code fences', () => {
    assert.deepEqual(parseJsonFromModel('```json {"a":1} ```'), { a: 1 });
  });

  it('parseJsonFromModel extracts JSON from prose', () => {
    assert.deepEqual(parseJsonFromModel('here:\n{"x":[1,2]}\ndone'), { x: [1, 2] });
  });

  it('parseJsonFromModel throws on non-JSON', () => {
    assert.throws(() => parseJsonFromModel('no json here'), /no JSON object/);
  });
});
