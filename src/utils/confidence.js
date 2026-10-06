// Catalyst confidence scoring — earned, not hardcoded.
// Old behavior: flat 0.88 for every offline plan (hence "~80s" forever).
// New: plan prior × actual application rate × test outcome, capped at 0.97.

export const CONFIDENCE_CAP = 0.97;

export function scoreConfidence({ planConfidence = 0.8, attempted = 0, applied = 0, testsPassed = true } = {}) {
  const plan = clamp01(planConfidence);
  const application = attempted > 0 ? clamp01(applied / attempted) : 1;
  const tests = testsPassed ? 1 : 0.45;
  const score = Math.min(0.5 * plan + 0.3 * application + 0.2 * tests, CONFIDENCE_CAP);
  return {
    score: Math.round(score * 100) / 100,
    breakdown: {
      plan: Math.round(plan * 100) / 100,
      application: Math.round(application * 100) / 100,
      tests: Math.round(tests * 100) / 100,
    },
  };
}

function clamp01(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
