'use strict';
const fs = require('fs');
const digest = require('../src/lib/session-digest');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
function must(c, m) { if (!c) throw new Error(m); }
function record(session, signal, detail, observed_at) { return { session_id: session, signal: signal, detail: detail || {}, observed_at: observed_at || '2026-09-19T00:00:00Z' }; }
const records = [
  record('rollout-2026-09-19T01-00-00-a.jsonl', 'command_called', { command: 'npm test' }),
  record('rollout-2026-09-19T01-00-00-a.jsonl', 'check_seen', { command: 'npm test' }),
  record('rollout-2026-09-19T01-00-00-a.jsonl', 'file_changed', { file_paths: ['a.js'] }),
  record('rollout-2026-09-19T01-00-00-a.jsonl', 'check_gap', {}),
  record('rollout-2026-09-19T01-00-00-a.jsonl', 'risk_signal', {}),
  record('rollout-2026-09-19T01-00-00-a.jsonl', 'repeat_signature', { signature: 'sig-1', count: 4 }),
  record('rollout-2026-09-18T01-00-00-b.jsonl', 'command_called', { command: 'pytest -q' }, '2026-09-01T00:00:00Z'),
  record('rollout-2026-09-18T01-00-00-b.jsonl', 'command_called', { command: 'cd somewhere' }, '2026-09-01T00:00:01Z')
];
const report = digest.digest(records, { limit: 5 });
must(report.aggregate.sessions === 2 && report.aggregate.checks === 1 && report.aggregate.check_gaps === 1, 'digest aggregates per session');
must(report.sessions[0].records === 6 && report.sessions[0].files_changed === 1 && report.sessions[0].repeat_patterns_ge3 === 1, 'session block carries factual counts');
must(report.sessions[0].top_commands.length === 1 && report.sessions[0].top_commands[0].command === 'npm test', 'cd and read noise is excluded from top commands');
const filtered = digest.digest(records, { days: 1 });
must(filtered.aggregate.sessions === 1, 'days filter keeps only recent sessions');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-session-digest-'));
fs.writeFileSync(path.join(temp, 'change-records.jsonl'), records.map(function (r) { return JSON.stringify(r); }).join('\n') + '\n', 'utf8');
let cli = spawnSync(process.execPath, [path.resolve(__dirname, '..', 'scripts', 'session-digest.js'), '--state', temp, '--limit', '1', '--json'], { encoding: 'utf8' });
must(cli.status === 0 && JSON.parse(cli.stdout).aggregate.sessions === 2, 'session-digest CLI --limit must work');
cli = spawnSync(process.execPath, [path.resolve(__dirname, '..', 'bin', 'autoarmory.js'), 'digest', '--state', temp, '--days', '1', '--json'], { encoding: 'utf8' });
must(cli.status === 0 && JSON.parse(cli.stdout).schema_version === 'autoarmory/session-digest/v1', 'autoarmory digest --days must work');
console.log('session digest tests passed: factual aggregation, noise filtering, days filter');
