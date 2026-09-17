'use strict';
const fs = require('fs');
const path = require('path');
const snapshot = require('../src/lib/history-replay-snapshot');
function must(condition, message) { if (!condition) throw new Error(message); }
const evidence = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'docs', 'evidence', 'history-replay-snapshot-20260917.json'), 'utf8'));
const report = snapshot.verifySnapshot(evidence, { min_passes: 3, top_k: 10, context_budget: { context_budget_escape_count: 0 } });
must(report.ok === true, 'the shipped snapshot must re-derive a valid replay report');
must(report.metrics && report.metrics.replay_escape_count === 0 && report.metrics.tightening_rejection_count === 10, 'the shipped snapshot must re-derive the recorded replay metrics');
must(report.policy_reports.some(function (item) { return item.policy === 'skill-required' && item.tightening_rejection_count === 6; }), 'the snapshot must re-derive the skill-required policy');
must(!/[A-Za-z]:[\\/]|\/Users\/|\/home\//.test(JSON.stringify(evidence)), 'the snapshot must not contain machine paths');
must(!JSON.stringify(evidence).match(/prompt|final_text|stdout|stderr/i), 'the snapshot must not contain runner text fields');
console.log('history replay snapshot tests passed: shipped sanitized input re-derives tightening=10, escapes=0, skill-required=6');