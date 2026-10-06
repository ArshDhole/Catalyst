# Code Migration Tool - Complete Project Guide

## Project Overview

**What You're Building:** An AI-powered tool that migrates entire codebases from one language/version to another automatically. Users upload their code, select source/target versions, and get back fully migrated, tested code.

**Why It's Different:**
- Full codebase understanding (not one-file-at-a-time)
- Autonomous test validation and retry loops
- Dependency graph awareness
- Cost-optimized batching with caching
- Enterprise-grade output with confidence scores

**Who Needs This:**
- Companies migrating Python 2→3 (millions of LOC stuck)
- Rails apps upgrading versions
- Legacy Java teams modernizing
- Angular→React migrations
- Anyone with technical debt

**Technology Stack:**
- **Backend:** Node.js + Claude Opus 4.6 API
- **Frontend:** Next.js (React) for web
- **Code Analysis:** Babel/AST parsers, tree-sitter
- **Testing:** Integrated with Jest, pytest, etc.
- **Database:** PostgreSQL (for caching, results history)
- **Deployment:** Docker + Vercel/Railway

---

## Architecture Overview

```
┌─────────────────┐
│   React/Web UI  │  (Upload repo, select versions, see results)
└────────┬────────┘
         │
    ┌────▼─────────────────────────────┐
    │   Next.js Backend API            │
    ├─────────────────────────────────┤
    │ POST /api/migrate                │
    │ GET  /api/migration/:id          │
    │ GET  /api/migration/:id/diffs    │
    └────────┬────────────────────────┘
             │
    ┌────────▼─────────────────────────┐
    │  Migration Orchestrator (Core)   │
    ├─────────────────────────────────┤
    │ 1. Parser (understand structure) │
    │ 2. Analyzer (find patterns)      │
    │ 3. Planner (Opus: strategy)      │
    │ 4. Executor (apply changes)      │
    │ 5. Validator (run tests)         │
    │ 6. Fixer (Opus: retry on fail)   │
    │ 7. Reporter (diffs + confidence) │
    └────────┬───────────────────────┘
             │
    ┌────────▼─────────────────────────┐
    │  Claude Opus 4.6 API             │
    │  (Reasoning, refactoring, fixes) │
    └─────────────────────────────────┘
```

---

## Week 1: MVP Setup

### Phase 1: Initialize Project (Day 1)

```bash
# Create project directory
mkdir code-migration-tool
cd code-migration-tool

# Initialize Node.js project
npm init -y

# Install dependencies
npm install \
  dotenv \
  @anthropic-ai/sdk \
  express \
  cors \
  multer \
  axios \
  fs-extra \
  simple-git \
  @babel/parser \
  @babel/traverse \
  child-process-promise \
  uuid \
  pg \
  zod

# Dev dependencies
npm install -D \
  nodemon \
  @types/node \
  typescript

# Create directory structure
mkdir -p src/{api,core,parsers,executors,validators,utils}
mkdir -p public/uploads
mkdir -p tests
```

**Create .env file:**
```
ANTHROPIC_API_KEY=sk-ant-your-key-here
MODEL=claude-opus-4-20250805
DATABASE_URL=postgresql://user:password@localhost:5432/code_migration
NODE_ENV=development
PORT=3000
```

**Create src/server.js (Main Express Setup):**
```javascript
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import dotenv from 'dotenv';
import { v4 as uuid } from 'uuid';
import fs from 'fs-extra';
import path from 'path';

dotenv.config();

const app = express();
const upload = multer({ dest: 'public/uploads/' });

app.use(cors());
app.use(express.json());

// Store migration jobs in memory (later: move to DB)
const migrationJobs = new Map();

// API: Start migration
app.post('/api/migrate', upload.single('repo'), async (req, res) => {
  try {
    const { sourceVersion, targetVersion, migrationPath } = req.body;
    const jobId = uuid();
    
    // TODO: Validate inputs
    if (!sourceVersion || !targetVersion || !migrationPath) {
      return res.status(400).json({ error: 'Missing parameters' });
    }

    // Store job metadata
    migrationJobs.set(jobId, {
      id: jobId,
      status: 'analyzing',
      sourceVersion,
      targetVersion,
      migrationPath,
      uploadPath: req.file?.path,
      createdAt: new Date(),
      progress: 0,
    });

    // Trigger async migration (don't wait)
    runMigrationAsync(jobId).catch(err => {
      const job = migrationJobs.get(jobId);
      if (job) job.status = 'failed';
      if (job) job.error = err.message;
    });

    res.json({ jobId, status: 'queued' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// API: Check migration status
app.get('/api/migration/:id', (req, res) => {
  const job = migrationJobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

// API: Get migration results/diffs
app.get('/api/migration/:id/results', (req, res) => {
  const job = migrationJobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'completed') {
    return res.status(400).json({ error: 'Migration not completed' });
  }
  res.json({
    diffs: job.diffs,
    testResults: job.testResults,
    confidence: job.confidence,
    changedFiles: job.changedFiles,
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✓ Server running on http://localhost:${PORT}`);
});

export { migrationJobs, app };
```

---

### Phase 2: Core Migration Logic (Day 2-3)

**Create src/core/orchestrator.js:**
```javascript
import Anthropic from '@anthropic-ai/sdk';
import { parseCodebase } from '../parsers/codeParser.js';
import { executeChanges } from '../executors/codeExecutor.js';
import { runTests } from '../validators/testRunner.js';
import fs from 'fs-extra';
import path from 'path';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function runMigration(repoPath, sourceVersion, targetVersion, jobId) {
  console.log(`\n[${jobId}] Starting migration: ${sourceVersion} → ${targetVersion}`);
  
  try {
    // Step 1: Parse the codebase
    console.log(`[${jobId}] Parsing codebase...`);
    const codebaseAnalysis = await parseCodebase(repoPath, sourceVersion);
    
    // Step 2: Generate migration plan with Opus
    console.log(`[${jobId}] Generating migration plan with Opus...`);
    const migrationPlan = await generateMigrationPlan(
      codebaseAnalysis,
      sourceVersion,
      targetVersion
    );
    
    // Step 3: Execute the migration
    console.log(`[${jobId}] Executing migration...`);
    const results = await executeChanges(repoPath, migrationPlan);
    
    // Step 4: Validate with tests
    console.log(`[${jobId}] Running tests...`);
    const testResults = await runTests(repoPath);
    
    // Step 5: Handle failures with retry logic
    if (!testResults.passed) {
      console.log(`[${jobId}] Tests failed, asking Opus to fix...`);
      const fixedPlan = await fixFailedMigration(
        codebaseAnalysis,
        migrationPlan,
        testResults,
        sourceVersion,
        targetVersion
      );
      
      // Revert and re-apply
      await revertChanges(repoPath, results.originalContent);
      const retryResults = await executeChanges(repoPath, fixedPlan);
      const retryTestResults = await runTests(repoPath);
      
      return {
        status: 'completed',
        plan: fixedPlan,
        results: retryResults,
        testResults: retryTestResults,
        confidence: migrationPlan.confidence,
      };
    }
    
    return {
      status: 'completed',
      plan: migrationPlan,
      results: results,
      testResults: testResults,
      confidence: migrationPlan.confidence,
    };
  } catch (error) {
    console.error(`[${jobId}] Migration failed:`, error);
    throw error;
  }
}

async function generateMigrationPlan(codebaseAnalysis, sourceVersion, targetVersion) {
  const systemPrompt = `You are an expert code migration specialist. Your job is to analyze codebases and generate precise migration plans that:
1. Transform code from one version/language to another
2. Preserve functionality and behavior
3. Maintain dependency relationships
4. Follow best practices of the target version
5. Identify potential risks and edge cases

Always respond with valid JSON only, no markdown, no explanations.`;

  const userPrompt = `Analyze this codebase and generate a migration plan from ${sourceVersion} to ${targetVersion}.

CODEBASE STRUCTURE:
${JSON.stringify(codebaseAnalysis, null, 2)}

Generate a migration plan JSON with this exact structure:
{
  "strategy": "Brief description of overall approach",
  "riskLevel": "low|medium|high",
  "confidence": 0.95,
  "phases": [
    {
      "phase": 1,
      "description": "Phase description",
      "changes": [
        {
          "file": "path/to/file.py",
          "type": "syntax|import|api|deprecation|idiom",
          "old": "original code snippet",
          "new": "new code snippet",
          "reason": "why this change is needed",
          "confidence": 0.98
        }
      ]
    }
  ],
  "risks": [
    { "risk": "description", "mitigation": "how to handle" }
  ],
  "testStrategy": "How to validate the migration",
  "postMigrationSteps": ["step 1", "step 2"]
}`;

  const response = await client.messages.create({
    model: 'claude-opus-4-20250805',
    max_tokens: 8000,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: userPrompt,
      },
    ],
  });

  // Extract JSON from response
  const responseText = response.content[0].text;
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  
  if (!jsonMatch) {
    throw new Error('Failed to parse migration plan JSON');
  }

  return JSON.parse(jsonMatch[0]);
}

async function fixFailedMigration(
  codebaseAnalysis,
  originalPlan,
  testResults,
  sourceVersion,
  targetVersion
) {
  const systemPrompt = `You are a debugging expert. The code migration failed tests. Analyze the failures and generate a corrected migration plan.
Respond ONLY with valid JSON, no markdown.`;

  const userPrompt = `The migration from ${sourceVersion} to ${targetVersion} failed.

ORIGINAL PLAN:
${JSON.stringify(originalPlan, null, 2)}

TEST FAILURES:
${JSON.stringify(testResults.failures, null, 2)}

CODEBASE:
${JSON.stringify(codebaseAnalysis, null, 2)}

Generate a corrected migration plan (same JSON structure as before) that fixes these issues:`;

  const response = await client.messages.create({
    model: 'claude-opus-4-20250805',
    max_tokens: 8000,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: userPrompt,
      },
    ],
  });

  const jsonMatch = response.content[0].text.match(/\{[\s\S]*\}/);
  return JSON.parse(jsonMatch[0]);
}

async function revertChanges(repoPath, originalContent) {
  // Restore original files
  for (const [filePath, content] of Object.entries(originalContent)) {
    await fs.writeFile(path.join(repoPath, filePath), content);
  }
}
```

**Create src/parsers/codeParser.js:**
```javascript
import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';

const SUPPORTED_EXTENSIONS = {
  python: ['.py'],
  javascript: ['.js', '.ts', '.jsx', '.tsx'],
  java: ['.java'],
  ruby: ['.rb'],
  go: ['.go'],
};

export async function parseCodebase(repoPath, sourceVersion) {
  console.log(`Parsing codebase at ${repoPath}`);
  
  const files = await getAllFiles(repoPath);
  const codeFiles = files.filter(f => isCodeFile(f));
  
  const analysis = {
    totalFiles: codeFiles.length,
    language: detectLanguage(sourceVersion),
    files: [],
    imports: [],
    dependencies: [],
    patterns: [],
  };

  // Read file contents (limit for context)
  for (const file of codeFiles.slice(0, 50)) { // Limit to first 50 files for MVP
    const content = await fs.readFile(path.join(repoPath, file), 'utf8');
    
    analysis.files.push({
      path: file,
      size: content.length,
      lines: content.split('\n').length,
      preview: content.substring(0, 500), // First 500 chars
    });

    // Extract imports
    const imports = extractImports(content, sourceVersion);
    analysis.imports.push(...imports.map(imp => ({ file, ...imp })));
  }

  // Detect package.json / requirements.txt / etc
  analysis.dependencies = await detectDependencies(repoPath, sourceVersion);

  return analysis;
}

async function getAllFiles(dir, fileList = []) {
  const files = await fs.readdir(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = await fs.stat(filePath);
    
    if (stat.isDirectory()) {
      // Skip common non-code directories
      if (!['.git', 'node_modules', '__pycache__', '.venv', 'dist', 'build'].includes(file)) {
        await getAllFiles(filePath, fileList);
      }
    } else {
      fileList.push(path.relative(dir, filePath));
    }
  }
  
  return fileList;
}

function isCodeFile(filePath) {
  const ext = path.extname(filePath);
  return Object.values(SUPPORTED_EXTENSIONS).flat().includes(ext);
}

function detectLanguage(sourceVersion) {
  if (sourceVersion.includes('python')) return 'python';
  if (sourceVersion.includes('rails') || sourceVersion.includes('ruby')) return 'ruby';
  if (sourceVersion.includes('js') || sourceVersion.includes('node')) return 'javascript';
  if (sourceVersion.includes('java')) return 'java';
  return 'unknown';
}

function extractImports(content, sourceVersion) {
  const imports = [];
  const lines = content.split('\n');
  
  if (sourceVersion.includes('python')) {
    const importRegex = /^(?:from|import)\s+(.+)$/gm;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      imports.push({ type: 'import', value: match[1] });
    }
  } else if (sourceVersion.includes('js') || sourceVersion.includes('node')) {
    const importRegex = /^(?:import|require)\s+(.+)$/gm;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      imports.push({ type: 'import', value: match[1] });
    }
  }
  
  return imports;
}

async function detectDependencies(repoPath, sourceVersion) {
  const dependencies = [];
  
  if (sourceVersion.includes('python')) {
    const reqFile = path.join(repoPath, 'requirements.txt');
    if (await fs.pathExists(reqFile)) {
      const content = await fs.readFile(reqFile, 'utf8');
      dependencies.push(...content.split('\n').filter(l => l.trim()));
    }
  } else if (sourceVersion.includes('js') || sourceVersion.includes('node')) {
    const pkgFile = path.join(repoPath, 'package.json');
    if (await fs.pathExists(pkgFile)) {
      const pkg = JSON.parse(await fs.readFile(pkgFile, 'utf8'));
      dependencies.push(...Object.keys(pkg.dependencies || {}));
    }
  }
  
  return dependencies;
}
```

**Create src/executors/codeExecutor.js:**
```javascript
import fs from 'fs-extra';
import path from 'path';

export async function executeChanges(repoPath, migrationPlan) {
  const originalContent = {};
  const changes = [];

  // Flatten all changes from all phases
  const allChanges = [];
  for (const phase of migrationPlan.phases) {
    allChanges.push(...phase.changes);
  }

  // Group by file
  const changesByFile = {};
  for (const change of allChanges) {
    if (!changesByFile[change.file]) {
      changesByFile[change.file] = [];
    }
    changesByFile[change.file].push(change);
  }

  // Apply changes to each file
  for (const [filePath, fileChanges] of Object.entries(changesByFile)) {
    const fullPath = path.join(repoPath, filePath);
    
    // Save original
    const original = await fs.readFile(fullPath, 'utf8');
    originalContent[filePath] = original;
    
    // Apply changes
    let modified = original;
    for (const change of fileChanges) {
      // Simple string replacement (later: use AST-based replacements)
      modified = modified.replace(change.old, change.new);
    }
    
    // Write back
    await fs.writeFile(fullPath, modified, 'utf8');
    
    changes.push({
      file: filePath,
      changeCount: fileChanges.length,
      status: 'applied',
    });
  }

  return {
    changedFiles: Object.keys(changesByFile),
    changes,
    originalContent,
  };
}
```

**Create src/validators/testRunner.js:**
```javascript
import { execSync } from 'child_process';
import fs from 'fs-extra';
import path from 'path';

export async function runTests(repoPath) {
  console.log(`Running tests in ${repoPath}...`);
  
  const testFramework = await detectTestFramework(repoPath);
  
  if (!testFramework) {
    return {
      passed: true,
      framework: 'none',
      message: 'No test framework detected',
    };
  }

  try {
    const command = getTestCommand(testFramework);
    const output = execSync(command, {
      cwd: repoPath,
      encoding: 'utf8',
      stdio: 'pipe',
    });

    return {
      passed: true,
      framework: testFramework,
      output,
      message: 'All tests passed',
    };
  } catch (error) {
    return {
      passed: false,
      framework: testFramework,
      failures: error.stdout || error.message,
      output: error.stderr || '',
      message: 'Tests failed',
    };
  }
}

async function detectTestFramework(repoPath) {
  const packageJson = path.join(repoPath, 'package.json');
  const pyproject = path.join(repoPath, 'pyproject.toml');
  const requirements = path.join(repoPath, 'requirements.txt');

  // Check package.json
  if (await fs.pathExists(packageJson)) {
    const pkg = JSON.parse(await fs.readFile(packageJson, 'utf8'));
    if (pkg.devDependencies?.jest || pkg.dependencies?.jest) return 'jest';
    if (pkg.devDependencies?.mocha || pkg.dependencies?.mocha) return 'mocha';
  }

  // Check Python
  if (await fs.pathExists(requirements)) {
    const content = await fs.readFile(requirements, 'utf8');
    if (content.includes('pytest')) return 'pytest';
    if (content.includes('unittest')) return 'unittest';
  }

  return null;
}

function getTestCommand(framework) {
  const commands = {
    jest: 'npm test',
    mocha: 'npm test',
    pytest: 'pytest',
    unittest: 'python -m unittest discover',
  };
  return commands[framework] || 'npm test';
}
```

**Create package.json scripts:**
```json
{
  "scripts": {
    "start": "node src/server.js",
    "dev": "nodemon src/server.js",
    "test": "jest",
    "build": "tsc"
  }
}
```

Run the backend:
```bash
npm run dev
```

---

### Phase 3: React Frontend (Day 4-5)

**Create frontend directory:**
```bash
mkdir frontend
cd frontend
npx create-next-app@latest --typescript --tailwind
```

**frontend/app/page.tsx:**
```typescript
'use client';

import { useState } from 'react';
import axios from 'axios';

interface MigrationJob {
  jobId: string;
  status: 'queued' | 'analyzing' | 'planning' | 'executing' | 'validating' | 'completed' | 'failed';
  progress: number;
  sourceVersion?: string;
  targetVersion?: string;
  error?: string;
  diffs?: string[];
  testResults?: any;
  confidence?: number;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [sourceVersion, setSourceVersion] = useState('python2');
  const [targetVersion, setTargetVersion] = useState('python3');
  const [loading, setLoading] = useState(false);
  const [job, setJob] = useState<MigrationJob | null>(null);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  const migrationPaths = [
    { from: 'python2', to: 'python3', label: 'Python 2 → Python 3' },
    { from: 'rails4', to: 'rails7', label: 'Rails 4 → Rails 7' },
    { from: 'js-es5', to: 'js-es2020', label: 'ES5 → ES2020' },
    { from: 'java8', to: 'java21', label: 'Java 8 → Java 21' },
  ];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      setFile(files[0]);
    }
  };

  const handleMigrate = async () => {
    if (!file) {
      alert('Please select a file');
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('repo', file);
    formData.append('sourceVersion', sourceVersion);
    formData.append('targetVersion', targetVersion);
    formData.append('migrationPath', `${sourceVersion}-to-${targetVersion}`);

    try {
      const response = await axios.post(
        'http://localhost:3000/api/migrate',
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
        }
      );

      const jobId = response.data.jobId;
      setJob({ jobId, status: 'queued' });

      // Poll for job status
      const interval = setInterval(async () => {
        const statusResponse = await axios.get(
          `http://localhost:3000/api/migration/${jobId}`
        );
        const updatedJob = statusResponse.data;
        setJob(updatedJob);

        if (updatedJob.status === 'completed' || updatedJob.status === 'failed') {
          clearInterval(interval);
          setLoading(false);
          setPollingInterval(null);
        }
      }, 2000);

      setPollingInterval(interval);
    } catch (error) {
      console.error(error);
      alert('Migration failed');
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: { [key: string]: string } = {
      queued: 'bg-gray-200',
      analyzing: 'bg-blue-200',
      planning: 'bg-blue-300',
      executing: 'bg-yellow-200',
      validating: 'bg-purple-200',
      completed: 'bg-green-200',
      failed: 'bg-red-200',
    };
    return colors[status] || 'bg-gray-200';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Code Migration Tool</h1>
        <p className="text-gray-600 mb-8">
          Automatically migrate your codebase with AI-powered analysis and validation
        </p>

        <div className="bg-white rounded-lg shadow-lg p-8">
          {!job ? (
            <div className="space-y-6">
              {/* File Upload */}
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 hover:border-blue-500 cursor-pointer">
                <input
                  type="file"
                  onChange={handleFileChange}
                  className="hidden"
                  id="file-input"
                  accept=".zip,.tar,.tar.gz"
                />
                <label htmlFor="file-input" className="cursor-pointer">
                  <div className="text-center">
                    <p className="text-gray-600">
                      {file ? `✓ ${file.name}` : 'Click to upload or drag and drop'}
                    </p>
                    <p className="text-sm text-gray-400 mt-1">ZIP or TAR.GZ</p>
                  </div>
                </label>
              </div>

              {/* Migration Path Selection */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    From
                  </label>
                  <select
                    value={sourceVersion}
                    onChange={(e) => setSourceVersion(e.target.value)}
                    className="w-full border border-gray-300 rounded px-3 py-2"
                  >
                    {migrationPaths.map((path) => (
                      <option key={path.from} value={path.from}>
                        {path.label.split(' → ')[0]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    To
                  </label>
                  <select
                    value={targetVersion}
                    onChange={(e) => setTargetVersion(e.target.value)}
                    className="w-full border border-gray-300 rounded px-3 py-2"
                  >
                    {migrationPaths.map((path) => (
                      <option key={path.to} value={path.to}>
                        {path.label.split(' → ')[1]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Start Button */}
              <button
                onClick={handleMigrate}
                disabled={!file || loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-bold py-3 rounded-lg transition"
              >
                {loading ? 'Starting Migration...' : 'Start Migration'}
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Job Status */}
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">
                    Status: {job.status.toUpperCase()}
                  </span>
                  <span className="text-sm text-gray-500">{job.progress}%</span>
                </div>
                <div className={`w-full h-3 rounded-full ${getStatusColor(job.status)}`}></div>
              </div>

              {/* Detailed Status */}
              <div className="bg-gray-50 rounded p-4">
                <p className="text-sm text-gray-600">
                  {job.status === 'queued' && 'Waiting to start...'}
                  {job.status === 'analyzing' && 'Analyzing your codebase...'}
                  {job.status === 'planning' && 'Generating migration strategy...'}
                  {job.status === 'executing' && 'Applying changes...'}
                  {job.status === 'validating' && 'Running tests...'}
                  {job.status === 'completed' && '✓ Migration completed successfully!'}
                  {job.status === 'failed' && `✗ Migration failed: ${job.error}`}
                </p>
              </div>

              {/* Results */}
              {job.status === 'completed' && (
                <div className="space-y-4">
                  <div className="bg-green-50 border border-green-200 rounded p-4">
                    <p className="text-green-800 font-semibold">✓ Success!</p>
                    <p className="text-green-700 text-sm mt-1">
                      Confidence: {Math.round((job.confidence || 0) * 100)}%
                    </p>
                  </div>

                  <button
                    onClick={() => setJob(null)}
                    className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
                  >
                    New Migration
                  </button>
                </div>
              )}

              {job.status === 'failed' && (
                <button
                  onClick={() => setJob(null)}
                  className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
                >
                  Try Again
                </button>
              )}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">How it works:</h3>
          <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
            <li>Upload your codebase as a ZIP or TAR.GZ file</li>
            <li>Claude analyzes the structure and dependencies</li>
            <li>AI generates a migration strategy</li>
            <li>Changes are applied automatically</li>
            <li>Tests validate the migration</li>
            <li>Download the migrated code</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
```

---

## Week 2: Enhancement & Polish

### Phase 4: Database Integration (Day 6-7)

**Create db/migrations/001_init.sql:**
```sql
CREATE TABLE migrations (
  id UUID PRIMARY KEY,
  status VARCHAR(50),
  sourceVersion VARCHAR(100),
  targetVersion VARCHAR(100),
  uploadPath TEXT,
  resultsPath TEXT,
  confidence FLOAT,
  createdAt TIMESTAMP,
  completedAt TIMESTAMP,
  errorMessage TEXT
);

CREATE TABLE migration_changes (
  id UUID PRIMARY KEY,
  migrationId UUID REFERENCES migrations(id),
  filePath TEXT,
  changeType VARCHAR(50),
  oldCode TEXT,
  newCode TEXT,
  confidence FLOAT
);

CREATE TABLE test_results (
  id UUID PRIMARY KEY,
  migrationId UUID REFERENCES migrations(id),
  testFramework VARCHAR(50),
  passed BOOLEAN,
  output TEXT,
  failures TEXT
);
```

### Phase 5: Advanced Features (Week 2+)

**Add these to your roadmap:**

1. **Diff Viewer**
   - Side-by-side comparison
   - Highlight changes
   - Accept/reject individual changes

2. **Multi-Language Support**
   - Python 2→3, 3.8→3.11
   - Ruby/Rails versions
   - JavaScript/TypeScript versions
   - Java versions

3. **Custom Migration Rules**
   - Users define custom patterns
   - API rename mappings
   - Deprecation guides

4. **Caching & Optimization**
   - Cache analysis results
   - Batch multiple repos
   - Reduce API costs

5. **GitHub Integration**
   - Authenticate with GitHub
   - Auto-create PRs
   - Run against live repos

---

## Complete Prompt for Opus

Here's the system prompt to use when asking Opus for migration help:

```
You are an expert code migration specialist with deep knowledge of software versioning, deprecation patterns, and refactoring best practices.

Your job is to analyze codebases and generate precise, comprehensive migration plans that:

1. Transform code from one version/language/framework to another
2. Preserve all functionality, behavior, and semantics
3. Maintain and adapt dependency relationships
4. Follow idioms and best practices of the target version
5. Identify and mitigate risks and edge cases
6. Provide clear rationale for each change

KEY PRINCIPLES:
- Never assume; analyze the full context
- Preserve business logic absolutely
- Test assumptions with specific code examples
- Consider side effects and implicit behaviors
- Provide confidence scores for each change
- Group related changes logically
- Explain deprecations and their alternatives

RESPONSE FORMAT:
Always respond with valid JSON ONLY. No markdown. No explanations outside JSON.

Structure:
{
  "strategy": "High-level approach description",
  "riskLevel": "low|medium|high",
  "confidence": 0.85,
  "phases": [
    {
      "phase": 1,
      "title": "Phase title",
      "description": "What this phase does",
      "changes": [
        {
          "file": "path/to/file",
          "type": "syntax|import|api|deprecation|idiom|config",
          "old": "Original code snippet",
          "new": "New code snippet",
          "reason": "Why this change",
          "notes": "Additional context",
          "confidence": 0.95
        }
      ]
    }
  ],
  "risks": [
    {
      "risk": "Description of potential issue",
      "severity": "low|medium|high",
      "mitigation": "How to handle this risk"
    }
  ],
  "testStrategy": "Describe how to validate the migration",
  "dependencies": {
    "toAdd": ["new-lib>=1.0"],
    "toRemove": ["old-lib"],
    "toUpdate": [{"from": "lib@1.0", "to": "lib@2.0"}]
  },
  "postMigrationTasks": ["Task 1", "Task 2"],
  "estimatedComplexity": "low|medium|high"
}
```

---

## Running the Full Stack

**Terminal 1 (Backend):**
```bash
cd code-migration-tool
npm run dev
```

**Terminal 2 (Frontend):**
```bash
cd frontend
npm run dev
```

Then visit: `http://localhost:3000`

---

## Testing Your MVP

**Test Case 1: Python 2→3 Simple File**
```bash
# Create test repo
mkdir test-python-repo
cd test-python-repo

# Create a simple Python 2 file
cat > main.py << 'EOF'
#!/usr/bin/env python
# -*- coding: utf-8 -*-

print "Hello, World!"

def divide(a, b):
    return float(a) / b

class MyClass:
    def __init__(self, name):
        self.name = name
    
    def greet(self):
        print "Hello, " + self.name

if __name__ == "__main__":
    print divide(10, 3)
    obj = MyClass("Python")
    obj.greet()
EOF

# Zip it
zip -r repo.zip .

# Upload via UI
```

---

## Deployment Strategy

**Option 1: Vercel (Frontend) + Railway (Backend)**
```bash
# Deploy backend to Railway
railway init
railway deploy

# Deploy frontend to Vercel
vercel deploy
```

**Option 2: Docker + fly.io**
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src ./src
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "src/server.js"]
```

---

## Open Source Marketing

1. **GitHub Repo:**
   - Clear README with examples
   - Supported migrations table
   - Installation instructions
   - Demo video

2. **Blog Post:**
   - "How I Built an AI Code Migration Tool"
   - Technical deep dive
   - Results/benchmarks

3. **HackerNews / Reddit:**
   - Share on r/programming, r/python, etc.
   - Explain what makes it different

4. **GitHub Releases:**
   - Tag milestones
   - Write release notes
   - Highlight new migration paths

---

## Success Metrics

✓ 100 GitHub stars  
✓ 10 successful migrations (different projects)  
✓ >90% test pass rate post-migration  
✓ <$1 per migration cost  
✓ <5 min per 100KB codebase  

---

**You're ready to build! Start with Day 1, follow the phases sequentially. Questions? Refer back to this guide.**
