'use strict';

function arr(value) { return Array.isArray(value) ? value : []; }
function num(value, fallback) { const n = Number(value); return Number.isFinite(n) ? n : (fallback || 0); }

function wilson(successes, total, z) {
  const n = num(total, 0);
  if (!n) return { low: 0, high: 0, center: 0 };
  const p = num(successes, 0) / n;
  const zValue = z === undefined ? 1.96 : Number(z);
  const denominator = 1 + (zValue * zValue) / n;
  const center = (p + (zValue * zValue) / (2 * n)) / denominator;
  const margin = (zValue * Math.sqrt((p * (1 - p) + (zValue * zValue) / (4 * n)) / n)) / denominator;
  return { low: Math.max(0, center - margin), high: Math.min(1, center + margin), center };
}

function compare(before, after) {
  const b = arr(before);
  const a = arr(after);
  const bPass = b.filter(function (x) { return x.pass === true; }).length;
  const aPass = a.filter(function (x) { return x.pass === true; }).length;
  const bInterval = wilson(bPass, b.length);
  const aInterval = wilson(aPass, a.length);
  const delta = aInterval.center - bInterval.center;
  const significant = aInterval.low > bInterval.high || bInterval.low > aInterval.high;
  return {
    schema_version: 'selfforge/experiment/v1',
    before: { trials: b.length, pass: bPass, rate: bInterval.center, interval: bInterval },
    after: { trials: a.length, pass: aPass, rate: aInterval.center, interval: aInterval },
    delta,
    significant,
    verdict: delta > 0 && significant ? 'improved' : (delta < 0 && significant ? 'regressed' : 'inconclusive')
  };
}

function shadowPlan(candidate) {
  return {
    schema_version: 'selfforge/shadow-plan/v1',
    candidate_id: candidate && candidate.id,
    state: 'shadow',
    exposure: 0,
    next_state: 'canary',
    requirements: ['no security violations', 'no regression in existing cases', 'independent verification'],
    rollback: 'restore previous artifact and mark candidate rejected'
  };
}

function canaryPlan(candidate, percent) {
  return {
    schema_version: 'selfforge/canary-plan/v1',
    candidate_id: candidate && candidate.id,
    state: 'canary',
    exposure_percent: num(percent, 10),
    next_state: 'promoted',
    stop_conditions: ['security violation', 'regression', 'error budget exhausted'],
    rollback: 'restore previous artifact and quarantine candidate'
  };
}

module.exports = { wilson, compare, shadowPlan, canaryPlan };
