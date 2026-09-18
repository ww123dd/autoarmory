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
must(inspector.resultStatus('exited with code 0').status === 'command_result_passed', 'exited-with-code form must be structured');
must(inspector.resultStatus('Process exited with code 7').exit_code === 7, 'nonzero exited-with-code form must preserve the exit code');
const second = inspector.inspect(events, state, { verifier_ids: ['pytest'] });
must(second.records.length === 0, 'incremental rerun must be idempotent');
must(first.candidate_cases.some(function (d) { return d.status === 'candidate'; }), 'high-signal change must produce a candidate draft');
function signalRecord(signal, id, turn, detail) { return { id:id, session_id:'s1', turn_id:turn, signal:signal, source:{ event_id:id, turn_id:turn, call_id:detail && detail.call_id || null, line:1 }, detail:detail || {} }; }
const riskAlone = inspector.candidateCases([signalRecord('risk_signal','r1','t-risk',{})], {});
must(riskAlone[0].candidate === true && riskAlone[0].high_signal === false, 'risk alone is candidate but not high_signal');
const riskGap = inspector.candidateCases([signalRecord('risk_signal','r2','t-gap',{}), signalRecord('check_gap','g2','t-gap',{})], {});
must(riskGap[0].high_signal === true, 'risk plus check gap is high_signal');
const repeat2 = inspector.candidateCases([signalRecord('repeat_signature','p1','t-rep2',{ count:1, signature:'sig-rep' }), signalRecord('repeat_signature','p2','t-rep2',{ count:2, signature:'sig-rep' })], {});
must(repeat2[0].candidate === true && repeat2[0].high_signal === false, 'repeat count two is candidate but not high_signal');
const thresholdState = {};
const repeat3 = inspector.candidateCases([signalRecord('repeat_signature','p3','t-rep3',{ count:1, signature:'sig-rep-3' }), signalRecord('repeat_signature','p4','t-rep3',{ count:2, signature:'sig-rep-3' }), signalRecord('repeat_signature','p5','t-rep3',{ count:3, signature:'sig-rep-3' })], { state: thresholdState });
must(repeat3[0].high_signal === true, 'repeat count three is high_signal');
const repeat4 = inspector.candidateCases([signalRecord('repeat_signature','p6','t-rep3',{ count:4, signature:'sig-rep-3' })], { state: thresholdState });
must(repeat4[0].candidate === true && repeat4[0].high_signal === false && repeat4[0].dedupe_reason === 'repeat_threshold_already_crossed', 'repeat threshold crossing notifies once');
const rebuildNoState = inspector.candidateCases([signalRecord('repeat_signature','p7','t-rep3',{ count:3, signature:'sig-rep-3' })], {});
must(rebuildNoState[0].high_signal === true && !rebuildNoState[0].dedupe_reason, 'projection rebuild without caller state must compute threshold truth without crashing');
const failedAlone = inspector.candidateCases([signalRecord('command_result_failed','f1','t-fail',{})], {});
must(failedAlone[0].candidate === true && failedAlone[0].high_signal === false, 'failed command alone is not high_signal');
must(riskAlone[0].change_id && riskAlone[0].id === riskAlone[0].change_id, 'change_id is the primary key');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-change-inspector-'));
const session = path.join(temp, 'session.jsonl');
fs.writeFileSync(session, events.map(function (event) { return JSON.stringify({ payload: event }); }).join('\n') + '\n', 'utf8');
const script = path.resolve(__dirname, '..', 'scripts', 'change-inspect.js');
const result = spawnSync(process.execPath, [script, '--session', session, '--state', path.join(temp, 'state'), '--once', '--json'], { encoding: 'utf8' });
must(result.status === 0 && /change-inspector-run/.test(result.stdout), 'change inspector CLI must run: ' + result.stdout + result.stderr);
console.log('change inspector tests passed: check_seen/check_gap, unstructured result, exec_record_gap, idempotent increments, candidate draft');