import { execSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import { logger } from '../utils/logger.js';

/**
 * Catalyst validator: detects test framework and runs it with a timeout.
 * Never throws — always returns a { passed, ... } result object.
 */
export async function runTests(repoPath, timeoutMs = 120000) {
  logger.info(`Running tests in ${repoPath}...`);
  const testFramework = await detectTestFramework(repoPath);

  if (!testFramework) {
    return { passed: true, framework: 'none', message: 'No test framework detected — skipping validation' };
  }

  try {
    const command = getTestCommand(testFramework, repoPath);
    const output = execSync(command, {
      cwd: repoPath,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: timeoutMs,
    });
    return { passed: true, framework: testFramework, output, message: 'All tests passed' };
  } catch (error) {
    return {
      passed: false,
      framework: testFramework,
      failures: error.stdout?.toString() || error.message,
      output: error.stderr?.toString() || '',
      message: 'Tests failed',
    };
  }
}

export async function detectTestFramework(repoPath) {
  // Node
  const pkgPath = path.join(repoPath, 'package.json');
  if (await fs.pathExists(pkgPath)) {
    try {
      const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
      const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      if (allDeps.jest || pkg.scripts?.test?.includes('jest')) return 'jest';
      if (allDeps.mocha || pkg.scripts?.test?.includes('mocha')) return 'mocha';
      if (allDeps.vitest || pkg.scripts?.test?.includes('vitest')) return 'vitest';
      if (allDeps.pytest) return 'pytest';
      if (pkg.scripts?.test) return 'npm-test';
    } catch { /* ignore malformed package.json */ }
  }
  // Python
  for (const f of ['pytest.ini', 'pyproject.toml', 'tox.ini', 'setup.cfg']) {
    if (await fs.pathExists(path.join(repoPath, f))) {
      // don't assume pytest; check requirements too
      break;
    }
  }
  const reqPath = path.join(repoPath, 'requirements.txt');
  if (await fs.pathExists(reqPath)) {
    const content = await fs.readFile(reqPath, 'utf8');
    if (content.includes('pytest')) return 'pytest';
  }
  if (await fs.pathExists(path.join(repoPath, 'test_requirements.txt'))) return 'pytest';
  const hasPyTests =
    (await fs.pathExists(path.join(repoPath, 'tests'))) ||
    (await fs.pathExists(path.join(repoPath, 'test')));
  if (hasPyTests) {
    // default python runner if tests dir exists but no marker
    try {
      const topFiles = await fs.readdir(repoPath);
      if (topFiles.some((f) => f.endsWith('.py') || f === 'pytest.ini')) return 'pytest';
    } catch { /* ignore */ }
    return 'pytest';
  }
  // Java / Ruby / Go markers
  if (await fs.pathExists(path.join(repoPath, 'pom.xml'))) return 'maven';
  if (await fs.pathExists(path.join(repoPath, 'build.gradle'))) return 'gradle';
  if (await fs.pathExists(path.join(repoPath, 'Gemfile'))) return 'rspec';
  if (await fs.pathExists(path.join(repoPath, 'go.mod'))) return 'go-test';
  return null;
}

function getTestCommand(framework, repoPath) {
  void repoPath;
  const commands = {
    jest: 'npx jest --ci 2>&1',
    mocha: 'npm test 2>&1',
    vitest: 'npx vitest run 2>&1',
    'npm-test': 'npm test 2>&1',
    pytest: 'pytest -q 2>&1',
    unittest: 'python -m unittest discover 2>&1',
    maven: 'mvn -q test 2>&1',
    gradle: 'gradle test 2>&1',
    rspec: 'bundle exec rspec 2>&1',
    'go-test': 'go test ./... 2>&1',
  };
  return commands[framework] || 'npm test 2>&1';
}
