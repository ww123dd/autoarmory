'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { validateTriggerContract } = require('../src/lib/trigger-contract');
const { compareTriggerReports } = require('../src/lib/trigger-regression');
function must(condition, message) { if (!condition) throw new Error(message); }

const good = validateTriggerContract('Use when handling alpha tasks. Do not use for beta or frontend-only work.');
must(good.ok && good.when_to_use === 'handling alpha tasks' && /beta or frontend-only work/.test(good.when_not_to_use), 'trigger contract must parse positive and negative boundaries');
const bad = validateTriggerContract('Use when handling alpha tasks.');
must(!bad.ok && bad.errors.some(function (item) { return /when_not_to_use/.test(item); }), 'a missing negative boundary must be structurally red');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-trigger-'));
function report(id, unwanted) {
  return { schema_version: 'autoarmory/audit-report/v1', cases: 3, metrics: { unwanted_skill_loads: unwanted, premature_stop_count: 0, unauthorized_action_count: 0, audit_trace_missing_count: 0 }, records: ['r1', 'r2', 'r3'].map(function (caseId) { return { id: caseId, metrics: { unwanted_skill_loads: (caseId === id && unwanted > 0) ? 1 : 0 } }; }) };
}
const baseline = report('r1', 0);
const broken = report('r1', 1);
const positive = compareTriggerReports(baseline, broken, { expect: 'positive' });
must(positive.ok && positive.trigger_misfire_delta === 1 && positive.trigger_regression_count === 1, 'breaking the trigger must produce a positive misfire delta and regression count');
const restored = compareTriggerReports(baseline, baseline, { expect: 'zero' });
must(restored.ok && restored.trigger_regression_count === 0, 'restoring the trigger must return the regression count to zero');
const insufficient = compareTriggerReports({ records: [baseline.records[0]] }, { records: [baseline.records[0]] }, { expect: 'zero' });
must(!insufficient.ok && insufficient.errors.some(function (item) { return /at least 3/.test(item); }), 'fewer than three real requests must fail closed');

const script = path.resolve(__dirname, '..', 'scripts', 'trigger-regression.js');
const baseFile = path.join(root, 'baseline.json');
const brokenFile = path.join(root, 'broken.json');
fs.writeFileSync(baseFile, JSON.stringify(baseline), 'utf8');
fs.writeFileSync(brokenFile, JSON.stringify(broken), 'utf8');
const result = spawnSync(process.execPath, [script, '--baseline', baseFile, '--candidate', brokenFile, '--expect', 'positive', '--enforce', '--json'], { encoding: 'utf8' });
must(result.status === 0 && /trigger_misfire_delta/.test(result.stdout), 'trigger regression CLI must enforce the expected delta');
console.log('trigger contract tests passed: negative boundary required, three-request replay, positive misfire delta, restored zero, insufficient sample fails closed');