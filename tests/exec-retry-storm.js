'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const checker = require('../src/lib/exec-retry-storm');
function must(condition, message) { if (!condition) throw new Error(message); }
const cp = function (n) { return { type: 'tool_output', text: 'exec_command failed: CreateProcess { message: \"Rejected(\\"Failed to create unified exec process: CreateProcessWithLogonW failed: ' + n + '\\")\" }', is_error: true }; };
const mixedA = { type: 'tool_output', text: 'Error: ENOENT: no such file or directory', is_error: true };
const mixedB = { type: 'tool_output', text: 'Error: EACCES: permission denied', is_error: true };
const good = { type: 'tool_output', text: 'ok', is_error: false };
const positive = checker.analyze([cp(1909), good, cp(1909), cp(1909)], { threshold: 3 });
must(positive.should_have_stopped === true, 'three consecutive same-signature failures must stop');
must(positive.occurrences === 3 && positive.first_stop_index === 3, 'positive must record count and first stop index');
must(positive.signature === '1b9ef1fe1bf294a4', 'positive must use the pinned change-inspector signature');
const two = checker.analyze([cp(1909), cp(1909)], { threshold: 3 });
must(two.should_have_stopped === false && two.occurrences === 2, 'two failures must remain below threshold');
const alternating = checker.analyze([mixedA, mixedB, mixedA, mixedB], { threshold: 3 });
must(alternating.should_have_stopped === false && alternating.occurrences === 1, 'alternating signatures must not stop');
const explicit = checker.analyze([{ signature: 'sig-a', observed: 'same failure' }, { signature: 'sig-a', observed: 'same failure' }, { signature: 'sig-a', observed: 'same failure' }], { threshold: 3 });
must(explicit.should_have_stopped === true && explicit.observed === 'same failure', 'pre-normalized sequence entries must work');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-retry-storm-'));
const file = path.join(temp, 'sequence.jsonl');
fs.writeFileSync(file, [cp(1909), cp(1909), cp(1909)].map(function (item) { return JSON.stringify(item); }).join('\n') + '\n', 'utf8');
const fromFile = checker.fromJsonl(file, { threshold: 3 });
must(fromFile.should_have_stopped === true && fromFile.occurrences === 3, 'JSONL sequence must replay deterministically');
const replay = checker.fromChangeRecords([
  { session_id: 's1', signal: 'repeat_signature', source: { line: 1 }, detail: { signature: 'sig-a', count: 2 } },
  { session_id: 's1', signal: 'repeat_signature', source: { line: 2 }, detail: { signature: 'sig-a', count: 2 } },
  { session_id: 's2', signal: 'repeat_signature', source: { line: 1 }, detail: { signature: 'sig-b', count: 3 } },
  { session_id: 's2', signal: 'repeat_signature', source: { line: 2 }, detail: { signature: 'sig-b', count: 3 } },
  { session_id: 's2', signal: 'repeat_signature', source: { line: 3 }, detail: { signature: 'sig-b', count: 3 } }
], { threshold: 3 });
must(replay.positive_sessions === 1 && replay.count_two_signatures === 1 && replay.false_positive_on_count_two === 0, 'change-record replay must separate positive runs from count==2 negatives');
const tempRecords = path.join(temp, 'change-records.jsonl');
fs.writeFileSync(tempRecords, [
  { session_id: 's1', signal: 'repeat_signature', source: { line: 1 }, detail: { signature: 'sig-a', count: 2 } },
  { session_id: 's1', signal: 'repeat_signature', source: { line: 2 }, detail: { signature: 'sig-a', count: 2 } },
  { session_id: 's2', signal: 'repeat_signature', source: { line: 1 }, detail: { signature: 'sig-b', count: 3 } },
  { session_id: 's2', signal: 'repeat_signature', source: { line: 2 }, detail: { signature: 'sig-b', count: 3 } },
  { session_id: 's2', signal: 'repeat_signature', source: { line: 3 }, detail: { signature: 'sig-b', count: 3 } }
].map(function (row) { return JSON.stringify(row); }).join('\n') + '\n', 'utf8');
const replayCli = path.resolve(__dirname, '..', 'scripts', 'exec-retry-storm-replay.js');
const replayRun = require('child_process').spawnSync(process.execPath, [replayCli, '--records', tempRecords, '--json'], { encoding: 'utf8' });
must(replayRun.status === 0, 'exec retry storm replay CLI must exit zero');
const replayReport = JSON.parse(replayRun.stdout);
must(replayReport.positive_sessions === 1 && replayReport.count_two_signatures === 1 && replayReport.false_positive_on_count_two === 0, 'replay CLI must report positives and count==2 negatives separately');
console.log('exec retry storm tests passed: threshold=3, count==2 negative, alternating negative, JSONL replay, replay CLI');
const replayProgressed = checker.fromChangeRecords([
  { session_id: 's3', signal: 'repeat_signature', source: { line: 1 }, detail: { signature: 'sig-c', count: 2 } },
  { session_id: 's3', signal: 'repeat_signature', source: { line: 2 }, detail: { signature: 'sig-c', count: 3 } },
  { session_id: 's3', signal: 'repeat_signature', source: { line: 3 }, detail: { signature: 'sig-c', count: 4 } }
], { threshold: 3 });
must(replayProgressed.count_two_signatures === 0 && replayProgressed.positive_sessions === 1, 'a signature that progresses past 2 must not count as a count==2 negative');
const bridgeFile = path.resolve(__dirname, '..', 'examples', 'adapters', 'exec-retry-storm', 'bridge.js');
const sequenceFile = path.join(temp, 'bridge-sequence.jsonl');
fs.writeFileSync(sequenceFile, [cp(1909), cp(1909), cp(1909)].map(function (item) { return JSON.stringify(item); }).join('\n') + '\n', 'utf8');
const sequenceSha = require('crypto').createHash('sha256').update(fs.readFileSync(sequenceFile)).digest('hex');
const bridgePayload = { statement: JSON.stringify({ kind: 'exec-retry-storm', sequence_file: sequenceFile, sequence_sha256: sequenceSha, threshold: 3 }), server: { readonly: true, name: 'exec-retry-storm' } };
const bridgeRun = require('child_process').spawnSync(process.execPath, [bridgeFile], { input: JSON.stringify(bridgePayload), encoding: 'utf8' });
must(bridgeRun.status === 0, 'exec retry storm bridge must accept a valid sequence');
const bridgeReport = JSON.parse(bridgeRun.stdout);
must(bridgeReport.ok === true && bridgeReport.observed.should_have_stopped === true && bridgeReport.observed.occurrences === 3, 'bridge must re-derive the stop fact');
const tampered = JSON.parse(JSON.stringify(bridgePayload));
tampered.statement = JSON.stringify(Object.assign(JSON.parse(bridgePayload.statement), { sequence_sha256: '0'.repeat(64) }));
const tamperedRun = require('child_process').spawnSync(process.execPath, [bridgeFile], { input: JSON.stringify(tampered), encoding: 'utf8' });
must(tamperedRun.status === 3 && /digest mismatch/.test(tamperedRun.stdout), 'bridge must reject a changed sequence digest');
const cumulativeOnly = checker.fromChangeRecords([
  { session_id: 's4', signal: 'repeat_signature', source: { line: 1 }, detail: { signature: 'sig-d', count: 2 } },
  { session_id: 's4', signal: 'repeat_signature', source: { line: 2 }, detail: { signature: 'sig-e', count: 2 } },
  { session_id: 's4', signal: 'repeat_signature', source: { line: 3 }, detail: { signature: 'sig-d', count: 3 } }
], { threshold: 3 });
must(cumulativeOnly.positive_sessions === 0 && cumulativeOnly.positive_sessions_by_max_count === 1, 'cumulative count and consecutive run must be reported separately');
