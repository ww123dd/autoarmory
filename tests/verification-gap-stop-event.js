'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const gap = require('../src/lib/verification-gap-input');
function must(condition, message) { if (!condition) throw new Error(message); }
function write(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value, 'utf8'); }
function transcript(file, withCheck) {
  const rows = [
    { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '完成这个任务' }] } },
    { type: 'response_item', payload: { type: 'function_call', name: 'exec_command', arguments: JSON.stringify({ cmd: withCheck ? 'node tests/run.js' : 'Get-ChildItem' }) } },
    { type: 'response_item', payload: { type: 'function_call_output', output: withCheck ? 'AutoArmory tests passed' : 'file listing' } },
    { type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '完成' }] } }
  ];
  write(file, rows.map(function (row) { return JSON.stringify(row); }).join('\n') + '\n');
}
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-gap-stop-'));
const good = path.join(root, 'good.jsonl');
transcript(good, true);
const goodInput = gap.fromStopEvent({ session_id: 's1', turn_id: 't1', transcript_path: good });
must(goodInput.transcript === good && goodInput.boundary_line === 0 && goodInput.window >= 3, 'Stop event must produce a forward verification window');
const bridge = path.resolve(__dirname, '..', 'examples', 'adapters', 'verification-gap', 'bridge.js');
function runBridge(spec) { return spawnSync(process.execPath, [bridge], { input: JSON.stringify({ statement: JSON.stringify(spec), server: { readonly: true } }), encoding: 'utf8' }); }
const goodRun = runBridge(Object.assign({ kind: 'verification-gap' }, goodInput));
must(goodRun.status === 0, 'verification-gap bridge must accept the Stop-derived input');
const goodObserved = JSON.parse(goodRun.stdout).observed;
must(goodObserved.verification_gap_count === 0 && goodObserved.independent_check_count > 0, 'a check in the Stop window must close the gap');
const bad = path.join(root, 'bad.jsonl');
transcript(bad, false);
const badInput = gap.fromStopEvent({ session_id: 's2', turn_id: 't2', transcript_path: bad });
const badRun = runBridge(Object.assign({ kind: 'verification-gap' }, badInput));
const badObserved = JSON.parse(badRun.stdout).observed;
must(badRun.status === 0 && badObserved.verification_gap_count === 1 && badObserved.independent_check_count === 0, 'a completion without a check must leave the gap open');
const lock = path.resolve(__dirname, '..', 'verifiers.lock.json');
if (fs.existsSync(lock)) {
  const verify = require('../src/lib/verify');
  const captured = verify.captureRefs([{ id: 'stop-gap-good', verifier: 'verification-gap', params: { instance: goodInput } }], { repo: path.resolve(__dirname, '..'), trials: 1 });
  must(captured.status === 'captured' && captured.captured[0].exit_code === 0, 'registered verification-gap must re-derive Stop-derived input');
}
console.log('verification gap stop-event tests passed: last user boundary, positive window, gap negative, registered re-derivation');

