'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
process.env.AUTOARMORY_RUNNER_OFF = '1';
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
  { payload: { type: 'message', role: 'assistant', content: '已修复 npm test PASS，并记录 sha256 文件证据。' } },
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
must(drafts.every(function (draft) { return String(draft.session_id || '').indexOf(sessionId) !== -1 && draft.requires_agent_decision === true && draft.closure === false; }), 'drafts must preserve rollout provenance and remain non-final');
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
const textual = filesUnder(state).filter(function (file) { return /\.(?:json|jsonl)$/i.test(file) && !/change-inspector|session-case-drafts|session-unverifiable/.test(file); }).map(function (file) { return fs.readFileSync(file, 'utf8'); }).join('\n');
must(!/verifier_resolution|verifier_ref|verifier-bindings/.test(textual), 'change-inventory outputs must not contain verifier bindings');
must(!fs.existsSync(path.join(state, 'verifier-bindings.jsonl')), 'stop shadow must not write verifier-bindings.jsonl');
must(high.policy_invariants.llm_judge_calls === 0 && high.policy_invariants.auto_close_count === 0 && high.policy_invariants.manual_case_creation_count === 0, 'stop shadow must be deterministic and non-final');
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
must(fs.existsSync(path.join(state, 'session-case-drafts.jsonl')), 'stop shadow must write strict session-shadow drafts');
const sessionDrafts = fs.readFileSync(path.join(state, 'session-case-drafts.jsonl'), 'utf8').trim().split(/\r?\n/).filter(Boolean).map(function (line) { return JSON.parse(line); });
must(sessionDrafts.every(function (draft) { return draft.classification && draft.closure === false && draft.requires_agent_decision === true; }), 'session-shadow drafts must remain non-final');
must(fs.existsSync(path.join(state, 'last-stop.json')), 'stop shadow must leave a heartbeat');
result = spawnSync(process.execPath, [script], { cwd: repo, input: JSON.stringify({ hook_event_name: 'Stop', session_id: sessionId, stop_hook_active: true }), encoding: 'utf8', env: Object.assign({}, process.env, { CODEX_SESSION_ROOT: sessionRoot, AUTOARMORY_STOP_STATE: path.join(temp, 'active-state') }) });
must(result.status === 0 && !fs.existsSync(path.join(temp, 'active-state')), 'active stop recursion must be skipped');
const fallbackRoot = path.join(temp, 'fallback-sessions');
const fallbackDir = path.join(fallbackRoot, '2026', '09', '18');
fs.mkdirSync(fallbackDir, { recursive: true });
const fallbackId = '01a0fallback-0000-0000-000000000001';
const fallbackFile = path.join(fallbackDir, 'rollout-2026-09-18T17-50-00-different-id.jsonl');
fs.writeFileSync(fallbackFile, [
  JSON.stringify({ type:'session_meta', payload:{ session_id:'different-id', cwd:temp } }),
  JSON.stringify({ payload:{ type:'function_call', name:'apply_patch', call_id:'fallback-c1', id:'fallback-e1', arguments:JSON.stringify({ file_path:'src/fallback.js' }) } }),
  JSON.stringify({ payload:{ type:'function_call_output', call_id:'fallback-c1', id:'fallback-e2', output:'Success. Updated src/fallback.js' } }),
  JSON.stringify({ payload:{ type:'message', role:'assistant', content:'已修复 npm test PASS，并记录 sha256 文件证据。' } })
].join('\n') + '\n', 'utf8');
const fallbackState = path.join(temp, 'fallback-state');
result = spawnSync(process.execPath, [script], { cwd: repo, input: JSON.stringify({ hook_event_name:'Stop', session_id:fallbackId, cwd:temp, stop_hook_active:false }), encoding:'utf8', env:Object.assign({}, process.env, { CODEX_SESSION_ROOT:fallbackRoot, AUTOARMORY_STOP_STATE:fallbackState }) });
must(result.status === 0, 'fallback stop shadow must not block');
must(!fs.existsSync(path.join(fallbackState, 'case-drafts.jsonl')), 'cwd fallback must not be accepted as canonical session');
const fallbackGap = JSON.parse(fs.readFileSync(path.join(fallbackState, 'shadow-gaps.jsonl'), 'utf8').trim().split(/\r?\n/).pop());
must(fallbackGap.match === 'cwd_candidate' && fallbackGap.fallback_candidate.indexOf('different-id') !== -1, 'cwd fallback must remain diagnostic-only');
const beat = JSON.parse(fs.readFileSync(path.join(fallbackState, 'last-stop.json'), 'utf8'));
must(beat.match === 'cwd_candidate' && beat.candidate_count >= 1, 'heartbeat must report cwd candidate without using it');
const provenanceRoot = path.join(temp, 'provenance-sessions');
const provenanceDir = path.join(provenanceRoot, '2026', '09', '18');
fs.mkdirSync(provenanceDir, { recursive: true });
const provenanceSession = '01a0provenance-0000-0000-000000000001';
const provenanceFile = path.join(provenanceDir, 'rollout-2026-09-18T18-00-00-' + provenanceSession + '.jsonl');
fs.writeFileSync(provenanceFile, [
  JSON.stringify({ payload:{ type:'function_call', name:'apply_patch', call_id:'prov-c1', id:'prov-e1', arguments:JSON.stringify({ file_path:'src/provenance.js' }) } }),
  JSON.stringify({ payload:{ type:'function_call_output', call_id:'prov-c1', id:'prov-e2', output:'Success. Updated src/provenance.js' } }),
  JSON.stringify({ payload:{ type:'message', role:'assistant', content:'已修复 npm test PASS，并记录 provenance。' } })
].join('\n') + '\n', 'utf8');
const provenanceState = path.join(temp, 'provenance-state');
const provenanceEngine = path.join(provenanceState, 'change-inspector');
fs.mkdirSync(provenanceEngine, { recursive: true });
fs.writeFileSync(path.join(provenanceEngine, 'change-records.jsonl'), [
  JSON.stringify({ id:'a1', session_id:'session-A', turn_id:'turn-A', signal:'file_changed', source:{ event_id:'a1', turn_id:'turn-A', line:1 }, detail:{} }),
  JSON.stringify({ id:'b1', session_id:'session-B', turn_id:'turn-B', signal:'file_changed', source:{ event_id:'b1', turn_id:'turn-B', line:2 }, detail:{} }),
  JSON.stringify({ id:'fill1', session_id:null, turn_id:'turn-F', signal:'file_changed', source:{ event_id:'fill1', turn_id:'turn-F', line:3 }, detail:{} })
].join('\n') + '\n', 'utf8');
result = spawnSync(process.execPath, [script], { cwd: repo, input: JSON.stringify({ hook_event_name:'Stop', session_id:provenanceSession, turn_id:'turn-provenance', cwd:temp, stop_hook_active:false }), encoding:'utf8', env:Object.assign({}, process.env, { CODEX_SESSION_ROOT:provenanceRoot, AUTOARMORY_STOP_STATE:provenanceState }) });
must(result.status === 0, 'provenance stop shadow must not block');
const projected = fs.readFileSync(path.join(provenanceState, 'case-drafts.jsonl'), 'utf8').trim().split(/\r?\n/).filter(Boolean).map(function (line) { return JSON.parse(line); });
must(projected.some(function (d) { return d.session_id === 'session-A' && d.change_record_ids.indexOf('a1') !== -1; }), 'canonical session A provenance preserved');
must(projected.some(function (d) { return d.session_id === 'session-B' && d.change_record_ids.indexOf('b1') !== -1; }), 'canonical session B provenance preserved');
const newProjected = projected.filter(function (d) { return String(d.session_id || '').indexOf(provenanceSession) !== -1; });
const fillProjected = projected.find(function (d) { return d.change_record_ids.indexOf('fill1') !== -1; });
must(fillProjected && fillProjected.session_id === provenanceSession && fillProjected.provenance_status === 'filled_from_event', 'only missing provenance fills from current event');
must(newProjected.length >= 2, 'new and filled drafts point to the current session');
const provenanceSummary = JSON.parse(fs.readFileSync(path.join(provenanceState, 'stop-shadow-summary.json'), 'utf8'));
must(provenanceSummary.projection_total === projected.length && provenanceSummary.projection_total >= 3, 'projection total counts the full projection');
must(provenanceSummary.attribution_preserved_count >= 2 && provenanceSummary.attribution_filled_from_event_count === 1, 'attribution counters preserve canonical and fill only missing');
must(provenanceSummary.new_draft_count > 0 && provenanceSummary.projection_total === projected.length, 'new draft count must not inflate projection total');
const firstProjectionTotal = provenanceSummary.projection_total;
result = spawnSync(process.execPath, [script], { cwd: repo, input: JSON.stringify({ hook_event_name:'Stop', session_id:provenanceSession, turn_id:'turn-provenance-2', cwd:temp, stop_hook_active:false }), encoding:'utf8', env:Object.assign({}, process.env, { CODEX_SESSION_ROOT:provenanceRoot, AUTOARMORY_STOP_STATE:provenanceState }) });
must(result.status === 0, 'provenance rerun must not block');
const rerunSummary = JSON.parse(fs.readFileSync(path.join(provenanceState, 'stop-shadow-summary.json'), 'utf8'));
must(rerunSummary.projection_total === firstProjectionTotal, 'projection total stable across reruns');
const pendingRoot = path.join(temp, 'pending-sessions');
const pendingDir = path.join(pendingRoot, '2026', '09', '18');
fs.mkdirSync(pendingDir, { recursive: true });
const pendingSession = '01a0pending-0000-0000-000000000001';
const pendingFile = path.join(pendingDir, 'rollout-2026-09-18T18-10-00-' + pendingSession + '.jsonl');
fs.writeFileSync(pendingFile, [
  JSON.stringify({ payload:{ type:'function_call', name:'exec_command', call_id:'pend-c1', id:'pend-e1', turn_id:'turn-pending', arguments:JSON.stringify({ cmd:'Set-Content -Path "production.txt" x' }) } }),
  JSON.stringify({ payload:{ type:'function_call_output', call_id:'pend-c1', id:'pend-e2', turn_id:'turn-pending', output:'Success. Updated production.txt' } })
].join('\n') + '\n', 'utf8');
const pendingState = path.join(temp, 'pending-state');
result = spawnSync(process.execPath, [script], { cwd: repo, input: JSON.stringify({ hook_event_name:'Stop', session_id:pendingSession, turn_id:'turn-pending', cwd:temp, stop_hook_active:false }), encoding:'utf8', env:Object.assign({}, process.env, { CODEX_SESSION_ROOT:pendingRoot, AUTOARMORY_STOP_STATE:pendingState }) });
must(result.status === 0, 'pending stop shadow must not block');
const pendingFiles = fs.existsSync(path.join(pendingState, 'pending')) ? fs.readdirSync(path.join(pendingState, 'pending')).filter(function (name) { return /\.json$/.test(name); }) : [];
must(pendingFiles.length === 1, 'high-signal change must enqueue one pending job');
const pendingJob = JSON.parse(fs.readFileSync(path.join(pendingState, 'pending', pendingFiles[0]), 'utf8'));
must(pendingJob.change_id && pendingJob.session_id && pendingJob.signals.indexOf('risk_signal') !== -1 && pendingJob.signals.indexOf('check_gap') !== -1, 'pending job carries change identity, provenance and signals');
console.log('stop shadow tests passed: automatic session scan, idempotent drafts, shadow_gap fallback, no verifier/run/close/verdict');
