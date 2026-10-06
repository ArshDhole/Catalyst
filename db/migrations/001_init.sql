-- Catalyst database schema (Week 2 — run when Postgres is provisioned)
CREATE TABLE IF NOT EXISTS migrations (
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

CREATE TABLE IF NOT EXISTS migration_changes (
  id UUID PRIMARY KEY,
  migrationId UUID REFERENCES migrations(id),
  filePath TEXT,
  changeType VARCHAR(50),
  oldCode TEXT,
  newCode TEXT,
  confidence FLOAT
);

CREATE TABLE IF NOT EXISTS test_results (
  id UUID PRIMARY KEY,
  migrationId UUID REFERENCES migrations(id),
  testFramework VARCHAR(50),
  passed BOOLEAN,
  output TEXT,
  failures TEXT
);
