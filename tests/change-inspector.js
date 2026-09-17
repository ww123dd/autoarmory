'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const inspector = require('../src/lib/change-inspector');
function must(condition, message) { if (!condition) throw new Error(message); }
const events = [
  { type: 'tool_call', role: 'assistant', tool: 'exec_command', args: JSON.stringify({ cmd: 'pytest backend/tests -q' }), call_id: 'c1', id: 'e1', timestamp: '2026-01-01T00:00:00Z' },
  { type: 'tool_output', role: 'tool', call_id: 'c1', id: 'e2', text: 'FAILED one test', timestamp: '2026-01-01T00:00:01Z' },
  { type: 'tool_call', role: 'assistant', tool: 'apply_patch', args: '*** Update File: backend/app/x.py', call_id: 'c2', id: 'e3', timestamp: '2026-01-01T00:00:02Z' },
  { type: 'tool_output', role: 'tool', call_id: 'c2', id: 'e4', text: 'Success. Updated backend/app/x.py', timestamp: '2026-01-01T00:00:03Z' }
];
const state = { session_id: 'fixture', seen_ids: {}, signatures: {}, line: 0 };
const first = inspector.inspect(events, state, { verifier_ids: ['pytest'] });
must(first.metrics.file_changed_count === 1 && first.metrics.check_seen_count === 1 && first.metrics.check_gap_count === 1, 'change inventory must detect change, check and gap');
must(first.metrics.command_result_failed_count === 0 && first.metrics.result_text_unstructured_count === 1, 'unstructured transcript output must not be fabricated into exit_code');
must(first.metrics.exec_record_gap_count === 1 && first.metrics.transcript_field_fabrication_count === 0, 'check without exec-record must be reported as a gap');
const second = inspector.inspect(events, state, { verifier_ids: ['pytest'] });
must(second.records.length === 0, 'incremental rerun must be idempotent');
must(first.candidate_cases.some(function (d) { return d.status === 'candidate'; }), 'high-signal change must produce a candidate draft');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-change-inspector-'));
const session = path.join(temp, 'session.jsonl');
fs.writeFileSync(session, events.map(function (event) { return JSON.stringify({ payload: event }); }).join('\n') + '\n', 'utf8');
const script = path.resolve(__dirname, '..', 'scripts', 'change-inspect.js');
const result = spawnSync(process.execPath, [script, '--session', session, '--state', path.join(temp, 'state'), '--once', '--json'], { encoding: 'utf8' });
must(result.status === 0 && /change-inspector-run/.test(result.stdout), 'change inspector CLI must run: ' + result.stdout + result.stderr);
console.log('change inspector tests passed: check_seen/check_gap, unstructured result, exec_record_gap, idempotent increments, candidate draft');