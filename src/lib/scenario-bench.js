'use strict';

const fs = require('fs');
const { readJsonl } = require('./util');

const CAPABILITIES = [
  { id: 'evaluator.junit', provides: ['FAIL_TO_PASS', 'PASS_TO_PASS'], cost: 0.01, latency_ms: 500, reliability: 0.9 },
  { id: 'evaluator.promptfoo', provides: ['rubric'], cost: 0.02, latency_ms: 1000, reliability: 0.8 },
  { id: 'scanner.sarif', provides: ['no_static_errors'], cost: 0.005, latency_ms: 300, reliability: 0.85 },
  { id: 'evaluator.state-check', provides: ['state_validation'], cost: 0.003, latency_ms: 200, reliability: 0.8 }
];
const TASKS = [
  { id: 't1', required: ['FAIL_TO_PASS'] }, { id: 't2', required: ['FAIL_TO_PASS'] }, { id: 't3', required: ['FAIL_TO_PASS'] }, { id: 't4', required: ['FAIL_TO_PASS'] },
  { id: 't5', required: ['no_static_errors'] }, { id: 't6', required: ['no_static_errors'] }, { id: 't7', required: ['no_static_errors'] },
  { id: 't8', required: ['FAIL_TO_PASS', 'no_static_errors'] }, { id: 't9', required: ['FAIL_TO_PASS', 'no_static_errors'] }, { id: 't10', required: ['FAIL_TO_PASS', 'no_static_errors'] }
];
function pick(required) { return CAPABILITIES.filter(function (item) { return item.provides.some(function (gate) { return required.indexOf(gate) !== -1; }); }); }
function evaluate(strategy) {
  let cost = 0; let success = 0; let falsePass = 0; const latencies = []; const rows = [];
  for (const task of TASKS) {
    let selected = [];
    if (strategy === 'single-junit') selected = [CAPABILITIES[0]];
    else if (strategy === 'static-all') selected = [CAPABILITIES[0], CAPABILITIES[1], CAPABILITIES[2]];
    else selected = pick(task.required);
    const covered = new Set();
    for (const item of selected) { cost += item.cost; latencies.push(item.latency_ms); for (const gate of item.provides) covered.add(gate); }
    const ok = task.required.every(function (gate) { return covered.has(gate); });
    if (ok) success += 1; else falsePass += 1;
    rows.push({ task: task.id, required: task.required, selected: selected.map(function (item) { return item.id; }), success: ok });
  }
  const sorted = latencies.slice().sort(function (a, b) { return a - b; });
  return { id: strategy, tasks: TASKS.length, success: success, success_rate: success / TASKS.length, false_pass: falsePass, average_cost: cost / TASKS.length, p95_latency_ms: sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] : 0, rows: rows };
}
function realEvaluate(file, min) {
  const rows = readJsonl(file).filter(function (item) { return item.verified === true && item.source !== 'fixture'; });
  const strategies = {};
  for (const row of rows) { const id = row.strategy_id || 'unknown'; strategies[id] = (strategies[id] || 0) + 1; }
  if (!rows.length || Object.keys(strategies).length < 2 || Object.values(strategies).some(function (count) { return count < min; })) return { proof_status: 'insufficient_data', samples: rows.length, per_strategy: strategies };
  return { proof_status: 'evaluated_real', samples: rows.length, per_strategy: strategies };
}
function run(profileId, options) {
  const opts = options || {};
  if (profileId !== 'coding') return { schema_version: 'autoarmory/scenario-proof/v1', profile: profileId, proof_status: 'unsupported_profile', error: 'only coding scenario proof is implemented' };
  if (opts.real) { const real = realEvaluate(opts.real, Number(opts.min || 30)); return Object.assign({ schema_version: 'autoarmory/scenario-proof/v1', profile: profileId, synthetic: false }, real); }
  return { schema_version: 'autoarmory/scenario-proof/v1', profile: profileId, synthetic: true, proof_status: 'inconclusive_synthetic', note: 'Synthetic harness only. It cannot prove routing superiority until real verified outcomes exist.', strategies: [evaluate('single-junit'), evaluate('static-all'), evaluate('autoarmory')], claim: 'not_proven' };
}
module.exports = { run, CAPABILITIES, TASKS };
