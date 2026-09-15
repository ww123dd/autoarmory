'use strict';

const stats = require('./stats');

function arr(value) { return Array.isArray(value) ? value : []; }
function num(value, fallback) { const n = Number(value); return Number.isFinite(n) ? n : (fallback || 0); }

function wilsonInterval(successes, total, z) {
  const n = num(total, 0);
  if (n <= 0) return { low: 0, high: 0, center: 0 };
  const p = num(successes, 0) / n;
  const zValue = z === undefined ? 1.96 : Number(z);
  const denominator = 1 + (zValue * zValue) / n;
  const center = (p + (zValue * zValue) / (2 * n)) / denominator;
  const margin = (zValue * Math.sqrt((p * (1 - p) + (zValue * zValue) / (4 * n)) / n)) / denominator;
  return { low: Math.max(0, center - margin), high: Math.min(1, center + margin), center };
}

function percentile(values, p) {
  return stats.quantile(arr(values), p);
}

function groupTrials(trials) {
  const groups = {};
  for (const trial of arr(trials)) {
    const task = trial.task_id || trial.taskId || trial.id || 'task';
    if (!groups[task]) groups[task] = [];
    groups[task].push(trial);
  }
  return groups;
}

function reliabilityFromTrials(trials, k) {
  const groups = groupTrials(trials);
  const kValue = Math.max(1, num(k, 1));
  const taskRows = Object.keys(groups).map(function (taskId) {
    const list = groups[taskId];
    const ordered = list.slice().sort(function (a, b) { return num(a.trial_index, 0) - num(b.trial_index, 0); });
    const passCount = ordered.filter(function (trial) { return trial.pass === true || trial.success === true; }).length;
    const first = ordered[0] || {};
    const costs = ordered.map(function (trial) { return num(trial.cost, 0); });
    const latencies = ordered.map(function (trial) { return num(trial.latency_ms || trial.latency, 0); });
    let passPowerK = false;
    for (let i = 0; i + kValue <= ordered.length; i++) {
      if (ordered.slice(i, i + kValue).every(function (trial) { return trial.pass === true || trial.success === true; })) { passPowerK = true; break; }
    }
    return { task_id: taskId, trials: ordered.length, pass_count: passCount, pass_at_1: passCount / ordered.length, pass_power_k: passPowerK ? 1 : 0, cost: costs.reduce(function (a, b) { return a + b; }, 0), p95_latency_ms: percentile(latencies, 0.95), security_violations: ordered.reduce(function (a, trial) { return a + num(trial.security_violations, 0); }, 0), metadata: first.metadata || {} };
  });
  const totalTrials = taskRows.reduce(function (sum, row) { return sum + row.trials; }, 0);
  const totalPass = taskRows.reduce(function (sum, row) { return sum + row.pass_count; }, 0);
  const passPower = taskRows.reduce(function (sum, row) { return sum + row.pass_power_k; }, 0);
  const successes = taskRows.reduce(function (sum, row) { return sum + (row.pass_count === row.trials ? 1 : 0); }, 0);
  const interval = wilsonInterval(successes, taskRows.length || 1);
  const totalCost = taskRows.reduce(function (sum, row) { return sum + row.cost; }, 0);
  const latencyValues = taskRows.map(function (row) { return row.p95_latency_ms; });
  return {
    schema_version: 'skillcanary/reliability/v1',
    k: kValue,
    tasks: taskRows.length,
    trials: totalTrials,
    pass_at_1: totalTrials ? totalPass / totalTrials : 0,
    pass_power_k: taskRows.length ? passPower / taskRows.length : 0,
    confidence_interval: interval,
    cost_per_success: successes ? totalCost / successes : null,
    p95_latency_ms: percentile(latencyValues, 0.95),
    security_violations: taskRows.reduce(function (sum, row) { return sum + row.security_violations; }, 0),
    task_rows: taskRows
  };
}

function compositeReliability(steps) {
  const list = arr(steps).map(function (step, index) {
    return { id: step.id || 'step-' + (index + 1), success_probability: Math.max(0, Math.min(1, num(step.success_probability !== undefined ? step.success_probability : step.probability, 1))) };
  });
  const product = list.reduce(function (value, step) { return value * step.success_probability; }, 1);
  const independent = list.map(function (step) { return { id: step.id, success_probability: step.success_probability }; });
  return { steps: list.length, end_to_end_success: product, failure_probability: 1 - product, step_contributions: independent };
}

function compareReliability(before, after) {
  const b = reliabilityFromTrials(before, 1);
  const a = reliabilityFromTrials(after, 1);
  const delta = a.pass_at_1 - b.pass_at_1;
  const nonOverlap = a.confidence_interval.low > b.confidence_interval.high || b.confidence_interval.low > a.confidence_interval.high;
  let verdict = 'flat';
  if (delta > 0 && nonOverlap) verdict = 'improved';
  else if (delta < 0 && nonOverlap) verdict = 'regressed';
  else if (delta > 0) verdict = 'likely_improved';
  else if (delta < 0) verdict = 'likely_regressed';
  return { schema_version: 'skillcanary/reliability-comparison/v1', before: b, after: a, delta: { pass_at_1: delta, cost_per_success: (a.cost_per_success || 0) - (b.cost_per_success || 0), p95_latency_ms: a.p95_latency_ms - b.p95_latency_ms }, verdict, significant: nonOverlap };
}

module.exports = { wilsonInterval, percentile, reliabilityFromTrials, compositeReliability, compareReliability };
