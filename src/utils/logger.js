// Catalyst logger — lightweight structured logger (no deps)
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = (process.env.LOG_LEVEL || 'info').toLowerCase();

function shouldLog(level) {
  return (LEVELS[level] ?? 1) >= (LEVELS[currentLevel] ?? 1);
}

function format(jobId, msg) {
  const ts = new Date().toISOString();
  return jobId ? `[${ts}] [${jobId}] ${msg}` : `[${ts}] ${msg}`;
}

export const logger = {
  debug: (msg, jobId) => { if (shouldLog('debug')) console.debug(format(jobId, msg)); },
  info: (msg, jobId) => { if (shouldLog('info')) console.log(format(jobId, msg)); },
  warn: (msg, jobId) => { if (shouldLog('warn')) console.warn(format(jobId, msg)); },
  error: (msg, jobId) => { if (shouldLog('error')) console.error(format(jobId, msg)); },
};
