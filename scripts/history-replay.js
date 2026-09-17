#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { parseArgs, readJsonl, printJson, sha256 } = require('../src/lib/util');
const { contextBudget, budgetEscapes } = require('../src/lib/context-budget');
const history = require('../src/lib/history-replay');

const args = parseArgs(process.argv.slice(2));
const state = path.resolve(args.state || '.selfforge');
function read(file) { return fs.existsSync(file) ? readJsonl(file) : []; }
const input = {
  routing_decisions: read(path.join(state, 'routing-decisions.jsonl')),
  routing_actuals: read(path.join(state, 'routing-actual.jsonl')),
  outcomes: read(path.join(state, 'outcomes.jsonl')),
  mechanism_runs: read(path.join(state, 'mechanism-runs.jsonl')),
  transitions: read(path.join(state, 'transitions.jsonl'))
};
let context = null;
if (args.skill) {
  const skill = path.resolve(args.skill);
  const measured = contextBudget(skill);
  if (!measured.ok) { process.stderr.write('context budget failed: ' + measured.errors.join('; ') + '\n'); process.exit(2); }
  const escapes = budgetEscapes(measured.metrics, {});
  context = { skill_dir: skill, metrics: measured.metrics, context_budget_escape_count: escapes.count, violations: escapes.violations };
}
const report = history.replayHistory(input, { min_passes: args['min-passes'], ratio: args.ratio, top_k: args['top-k'], context_budget: context });
report.state = state;
report.source_sha256 = sha256(JSON.stringify(input));
if (args.json) printJson(report);
else {
  process.stdout.write('history replay: mechanisms=' + report.stream_counts.mechanism_runs + ' routing=' + report.stream_counts.routing_decisions + ' transitions=' + report.stream_counts.transitions + '\n');
  process.stdout.write('  sufficient=' + !report.insufficient_real_stream + ' verdict=' + report.strategy_verdict + '\n');
  if (report.metrics) {
    process.stdout.write('  replay_escape_count=' + report.metrics.replay_escape_count + ' tightening_rejection_count=' + report.metrics.tightening_rejection_count + '\n');
    process.stdout.write('  boundary_hit_rate=' + report.metrics.boundary_hit_rate + ' unwanted_agent_wakeups=' + report.metrics.unwanted_agent_wakeups + '\n');
    process.stdout.write('  cost_status=' + report.cost_status + '\n');
  }
  process.stdout.write('  context_budget_escape_count=' + (context ? context.context_budget_escape_count : 'not_measured') + '\n');
}
const hardFailure = report.synthetic_record_count !== 0 || report.llm_judge_calls !== 0 || report.insufficient_real_stream || (context && context.context_budget_escape_count !== 0) || (report.metrics && report.metrics.replay_escape_count !== 0);
process.exit(args.enforce && hardFailure ? 1 : 0);