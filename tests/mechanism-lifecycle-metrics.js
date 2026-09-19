'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const metrics = require('../src/lib/mechanism-lifecycle-metrics');
function must(condition, message) { if (!condition) throw new Error(message); }
function writeJsonl(file, rows) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, rows.map(function (row) { return JSON.stringify(row); }).join('\n') + (rows.length ? '\n' : ''), 'utf8'); }
const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-mechanism-metrics-empty-'));
const zero = metrics.read(empty, 'mech-1');
must(zero.reuse_count === 0 && zero.success_count === 0 && zero.overturn_count === 0 && zero.reopen_count === 0 && zero.lifecycle_state === 'candidate', 'missing state must project zeroed candidate metrics');
const state = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-mechanism-metrics-'));
writeJsonl(path.join(state, 'mechanism-runs.jsonl'), [
  { id: 'r1', mechanism_id: 'mech-1', finished_at: '2026-01-01T00:00:00.000Z' },
  { id: 'r2', mechanism_id: 'mech-1', finished_at: '2026-01-02T00:00:00.000Z' },
  { id: 'rx', mechanism_id: 'mech-2', finished_at: '2026-01-03T00:00:00.000Z' }
]);
writeJsonl(path.join(state, 'closures.jsonl'), [{ id: 'c1', mechanism_id: 'mech-1', closed_at: '2026-01-01T01:00:00.000Z' }]);
writeJsonl(path.join(state, 'outcome-records.jsonl'), [
  { outcome_id: 'o1', mechanism_id: 'mech-1', type: 'accepted', observed_at: '2026-01-01T02:00:00.000Z' },
  { outcome_id: 'o2', mechanism_id: 'mech-1', type: 'overturned', observed_at: '2026-01-02T02:00:00.000Z' },
  { outcome_id: 'o3', mechanism_id: 'mech-1', type: 'reopened', observed_at: '2026-01-03T02:00:00.000Z' }
]);
writeJsonl(path.join(state, 'lifecycle.jsonl'), [
  { id: 'l1', mechanism_id: 'mech-1', to: 'promoted', at: '2026-01-01T01:00:00.000Z' },
  { id: 'l2', mechanism_id: 'mech-1', to: 'retired', verdict: 'reopen_required', at: '2026-01-03T01:00:00.000Z' }
]);
const report = metrics.read(state, 'mech-1');
must(report.reuse_count === 2 && report.success_count === 1, 'metrics must count runs and closures');
must(report.overturn_count === 1 && report.reopen_count === 1, 'metrics must count overturned and reopened outcomes');
must(report.lifecycle_state === 'retired' && report.last_event_at === '2026-01-03T02:00:00.000Z', 'metrics must use latest lifecycle and event timestamps');
const cli = path.resolve(__dirname, '..', 'scripts', 'mechanism-metrics.js');
const cliRun = require('child_process').spawnSync(process.execPath, [cli, '--state', state, '--mechanism', 'mech-1', '--json'], { encoding: 'utf8' });
must(cliRun.status === 0, 'mechanism metrics CLI must exit zero for readable state');
const cliReport = JSON.parse(cliRun.stdout);
must(cliReport.reuse_count === 2 && cliReport.overturn_count === 1 && cliReport.lifecycle_state === 'retired', 'mechanism metrics CLI must expose the same real counts');
console.log('mechanism lifecycle metrics tests passed: zero-state and real run/closure/outcome/lifecycle counters');

