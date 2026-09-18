'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
function must(condition, message) { if (!condition) throw new Error(message); }
const repo = path.resolve(__dirname, '..');
const script = path.join(repo, 'scripts', 'stop-shadow.js');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-stop-shadow-'));
const sessionId = '01a0stop-test-0000-0000-000000000001';
const sessionRoot = path.join(temp, 'sessions');
const sessionDir = path.join(sessionRoot, '2026', '09', '18');
fs.mkdirSync(sessionDir, { recursive: true });
const sessionFile = path.join(sessionDir, 'rollout-2026-09-18T16-00-00-' + sessionId + '.jsonl');
const events = [
  { payload: { type: 'message', role: 'assistant', content: 'apply a change and verify it' } },
  { payload: { type: 'function_call', name: 'apply_patch', call_id: 'c1', id: 'e1', arguments: JSON.stringify({ file_path: 'src/a.js' }) } },
  { payload: { type: 'function_call_output', call_id: 'c1', id: 'e2', output: 'Success. Updated src/a.js' } },
  { payload: { type: 'function_call', name: 'exec_command', call_id: 'c2', id: 'e3', arguments: JSON.stringify({ cmd: 'npm test' }) } },
  { payload: { type: 'function_call_output', call_id: 'c2', id: 'e4', output: 'unstructured test output' } }
];
fs.writeFileSync(sessionFile, events.map(function (event) { return JSON.stringify(event); }).join('\n') + '\n', 'utf8');
const state = path.join(temp, 'state');
function run(event, extraEnv) {
  return spawnSync(process.execPath, [script], {
    cwd: repo,
    input: JSON.stringify(event),
    encoding: 'utf8',
    env: Object.assign({}, process.env, { CODEX_SESSION_ROOT: sessionRoot, AUTOARMORY_STOP_STATE: state, AUTOARMORY_STOP_TIMEOUT_MS: '5000' }, extraEnv || {})
  });
}
let result = run({ hook_event_name: 'Stop', session_id: sessionId, turn_id: 'turn-1', stop_hook_active: false, last_assistant_message: 'done' });
must(result.status === 0, 'stop shadow must never block the session: ' + result.stderr + result.stdout);
const draftsFile = path.join(state, 'case-drafts.jsonl');
const highSignalFile = path.join(state, 'high-signal.json');
must(fs.existsSync(draftsFile), 'stop shadow must write case-drafts.jsonl');
must(fs.existsSync(highSignalFile), 'stop shadow must write high-signal.json');
const drafts = fs.readFileSync(draftsFile, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(function (line) { return JSON.parse(line); });
must(drafts.length > 0, 'stop shadow must produce at least one draft');
must(drafts.every(function (draft) { return draft.session_id === sessionId && draft.requires_agent_decision === true && draft.closure === false; }), 'drafts must point to the session and remain non-final');
must(drafts.every(function (draft) { return !Object.prototype.hasOwnProperty.call(draft, 'verifier_resolution') && !Object.prototype.hasOwnProperty.call(draft, 'verifier_ref'); }), 'stop shadow must not bind a verifier');
const high = JSON.parse(fs.readFileSync(highSignalFile, 'utf8'));
must(high.schema_version === 'autoarmory/stop-shadow-high-signal/v1' && Array.isArray(high.changes), 'high-signal output shape');
function filesUnder(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push.apply(out, filesUnder(full));
    else out.push(full);
  }
  return out;
}
const textual = filesUnder(state).filter(function (file) { return /\.(?:json|jsonl)$/i.test(file); }).map(function (file) { return fs.readFileSync(file, 'utf8'); }).join('\n');
must(!/verifier_resolution|verifier_ref|verifier-bindings/.test(textual), 'stop shadow outputs must not contain verifier bindings');
must(high.llm_judge_calls === 0 && high.auto_close_count === 0 && high.manual_case_creation_count === 0, 'stop shadow must be deterministic and non-final');
for (const forbidden of ['mechanisms.jsonl', 'mechanism-runs.jsonl', 'closures.jsonl', 'verifier-bindings.jsonl']) {
  must(!fs.existsSync(path.join(state, forbidden)), 'stop shadow must not generate ' + forbidden);
}
const firstCount = drafts.length;
result = run({ hook_event_name: 'Stop', session_id: sessionId, turn_id: 'turn-2', stop_hook_active: false, last_assistant_message: 'done again' });
must(result.status === 0, 'second stop shadow run must not block');
const secondDrafts = fs.readFileSync(draftsFile, 'utf8').trim().split(/\r?\n/).filter(Boolean);
must(secondDrafts.length === firstCount, 'stop shadow rerun must be idempotent');
const gapState = path.join(temp, 'gap-state');
result = spawnSync(process.execPath, [script], { cwd: repo, input: JSON.stringify({ hook_event_name: 'Stop', session_id: 'missing-session-id', stop_hook_active: false }), encoding: 'utf8', env: Object.assign({}, process.env, { CODEX_SESSION_ROOT: sessionRoot, AUTOARMORY_STOP_STATE: gapState }) });
must(result.status === 0, 'missing session must not block');
must(fs.existsSync(path.join(gapState, 'shadow-gaps.jsonl')), 'missing session must record a shadow_gap');
result = spawnSync(process.execPath, [script], { cwd: repo, input: JSON.stringify({ hook_event_name: 'Stop', session_id: sessionId, stop_hook_active: true }), encoding: 'utf8', env: Object.assign({}, process.env, { CODEX_SESSION_ROOT: sessionRoot, AUTOARMORY_STOP_STATE: path.join(temp, 'active-state') }) });
must(result.status === 0 && !fs.existsSync(path.join(temp, 'active-state')), 'active stop recursion must be skipped');
console.log('stop shadow tests passed: automatic session scan, idempotent drafts, shadow_gap fallback, no verifier/run/close/verdict');
