'use strict';

const SEVERITY = { low: 1, medium: 2, high: 4, critical: 8 };
const DETERMINISM = { deterministic: 3, semantic: 1, unknown: 0 };

function arr(value) { return Array.isArray(value) ? value : []; }
function num(value, fallback) { const n = Number(value); return Number.isFinite(n) ? n : (fallback || 0); }

function acquireScore(item) {
  const severity = SEVERITY[String(item.severity || 'medium').toLowerCase()] || 2;
  const determinism = DETERMINISM[String(item.determinism || 'unknown').toLowerCase()] || 0;
  const frequency = num(item.frequency, 1);
  const coverageGap = item.coverage_gap === true ? 3 : 0;
  const uncertainty = num(item.uncertainty, 0) * 2;
  const unresolved = !/^TODO/i.test(String(item.assertion || '')) ? 2 : 0;
  return severity * 2 + determinism * 1.5 + Math.log2(frequency + 1) * 2 + coverageGap + uncertainty + unresolved;
}

function classifyCandidate(item, result) {
  const passRate = num(result && (result.pass_rate !== undefined ? result.pass_rate : result.pass_at_1), 0);
  const stable = result && result.stable === true;
  const trials = num(result && result.trials, 0);
  if (passRate >= 0.99 && stable && trials >= 3) return 'regression';
  if (passRate >= 0.9 && trials >= 3) return 'candidate_regression';
  return 'capability';
}

function coverage(cases, failureModes) {
  const modes = arr(failureModes);
  const covered = new Set(arr(cases).flatMap(function (item) { return item.failure_modes || (item.failure_mode ? [item.failure_mode] : []); }));
  const missing = modes.filter(function (mode) { return !covered.has(mode); });
  return { modes: modes.length, covered: modes.length - missing.length, coverage: modes.length ? (modes.length - missing.length) / modes.length : 1, missing };
}

function curate(candidates, options) {
  const opts = options || {};
  const top = num(opts.top, 20);
  return arr(candidates).map(function (item) {
    return Object.assign({}, item, { acquisition_score: acquireScore(item), proposed_suite: classifyCandidate(item, item.result || {}) });
  }).sort(function (a, b) { return b.acquisition_score - a.acquisition_score; }).slice(0, top);
}

module.exports = { acquireScore, classifyCandidate, coverage, curate };
