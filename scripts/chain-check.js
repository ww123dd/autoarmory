#!/usr/bin/env node
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { parseArgs, printJson, readJsonl } = require('../src/lib/util');
const digest = require('../src/lib/session-digest');
const loadGate = require('../src/lib/load-gate');
const verdictView = require('../src/lib/verdict-view');

function walk(dir, out) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch (_) { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/^rollout.*\.jsonl$/i.test(e.name)) out.push(full);
  }
  return out;
}
function git(repo, args) {
  const r = spawnSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true });
  return r.status === 0 ? String(r.stdout || '').trim() : null;
}

const args = parseArgs(process.argv.slice(2));
const repo = path.resolve(args.repo || process.cwd());
const root = path.resolve(args.root || process.env.AUTOARMORY_STATE || process.env.AUTOARMORY_STOP_STATE || path.join(os.homedir(), '.codex', 'autoarmory', 'stop-shadow'));
const engineDir = path.join(root, 'change-inspector');
let version = null;
try { version = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')).version; } catch (_) {}
const checks = [];
function check(name, pass, evidence, sources, files, reason) {
  checks.push({ chain: name, pass: !!pass, evidence: evidence, source_records: sources || [], source_files: files || [], failed_reason: pass ? null : (reason || 'condition not satisfied') });
}

let lastStop = null;
try { lastStop = JSON.parse(fs.readFileSync(path.join(root, 'last-stop.json'), 'utf8')); } catch (_) {}
const canonical = path.join(engineDir, 'change-records.jsonl');
const records = fs.existsSync(canonical) ? readJsonl(canonical) : [];
check('capture', !!lastStop && lastStop.status === 'ran' && records.length > 0, 'last-stop=' + (lastStop && lastStop.status) + ' records=' + records.length, [canonical], ['last-stop.json'], 'stop did not run or canonical is empty');

const sessionsRoot = path.join(os.homedir(), '.codex', 'sessions');
const files = fs.existsSync(sessionsRoot) ? walk(sessionsRoot, []) : [];
const state = fs.existsSync(path.join(engineDir, 'state.json')) ? JSON.parse(fs.readFileSync(path.join(engineDir, 'state.json'), 'utf8')) : { sessions: {} };
let covered = 0;
for (const f of files) {
  const c = state.sessions[f];
  if (c && c.offset >= fs.statSync(f).size) covered++;
}
const coverage = files.length ? covered / files.length : 0;
check('history', files.length > 0 && coverage >= 0.95, 'covered=' + covered + '/' + files.length + ' (' + Math.round(coverage * 100) + '%)', Object.keys(state.sessions || {}), files, 'coverage below 95% or no rollouts');

let projection = null;
try { projection = JSON.parse(fs.readFileSync(path.join(root, 'projection-state.json'), 'utf8')); } catch (_) {}
check('signals', !!projection && Number(projection.policy_version) >= 4 && Number(projection.projection_total) > 0 && Number.isFinite(Number(projection.high_signal_total)), 'policy=' + (projection && projection.policy_version) + ' drafts=' + (projection && projection.projection_total) + ' high_signal=' + (projection && projection.high_signal_total) + ' (zero is valid)', [path.join(root, 'projection-state.json')], [], 'projection missing or policy older than 4');

const index = verdictView.readReuseIndex(root);
const reuse = Object.keys(index).map(function (key) { return index[key]; });
const closed = reuse.filter(function (r) { return r.status === 'closed'; });
let freshest = null;
let freshness = 'missing';
let verdictReason = null;
for (const r of closed) {
  const effective = verdictView.verdictFor(r.change_id, index, { stateDir: root, repo: repo, decisionId: r.decision_id });
  freshest = { change_id: r.change_id, effective_state: effective.effective_state, mechanism_status: effective.mechanism_status || null, expiry_status: effective.expiry_status || null, reason: effective.reason || null };
  verdictReason = effective.reason || null;
  const s = effective.effective_state;
  if (s === 'valid-pass' || s === 'fresh' || s === 'closed') freshness = effective.stale_verification ? 'stale' : 'fresh';
  else if (s === 'expired') freshness = 'expired';
  else if (s === 'missing' || s === 'unverified') freshness = 'missing';
  else freshness = 'stale';
  break;
}
check('verdict', closed.length > 0, closed.length ? 'closed=' + closed.length + ' freshest=' + JSON.stringify(freshest) : 'no closed reuse-record', [path.join(root, 'reuse-records')], reuse.map(function (r) { return r.change_id; }), 'no closed reuse-record');

let gate = null;
try {
  gate = loadGate.consult(root, freshest ? freshest.change_id : (closed[0] && closed[0].change_id), { risk: 'low', repo: repo, stateDir: root });
} catch (_) {}
check('gate', !!gate && typeof gate.decision === 'string', 'decision=' + (gate && gate.decision) + ' verdict=' + freshness, [path.join(root, 'reuse-records')], [], 'load gate did not return a decision');

let digestReport = null;
try { digestReport = digest.digestFromEngine(engineDir, { limit: 1 }); } catch (_) {}
check('reading', !!digestReport && digestReport.aggregate.sessions > 0, 'sessions=' + (digestReport && digestReport.aggregate.sessions) + ' records=' + (digestReport && digestReport.records_input), records.slice(0, 1), [canonical], 'digest produced no sessions');

const all = checks.every(function (c) { return c.pass; });
const compact = checks.map(function (c) {
  const sr = c.source_records || [];
  const sf = c.source_files || [];
  return Object.assign({}, c, { source_records: sr.slice(0, 10), source_records_count: sr.length, source_files: sf.slice(0, 10), source_files_count: sf.length });
});
const out = {
  schema_version: 'autoarmory/chain-check/v2',
  generated_at: new Date().toISOString(),
  state_root: root,
  repo: repo,
  commit: git(repo, ['rev-parse', 'HEAD']),
  version: version,
  local_only: true,
  local_only_dependencies: ['~/.codex/sessions', 'state_root', 'verifiers.lock.json', 'local trust anchor'],
  chain_pass: all,
  verdict_freshness: freshness,
  verdict_reason: verdictReason,
  gate_decision: gate && gate.decision || null,
  chains: compact
};
if (args.json) printJson(out);
else {
  for (const c of checks) process.stdout.write((c.pass ? 'PASS ' : 'FAIL ') + c.chain.padEnd(9) + ' ' + c.evidence + '\n');
  process.stdout.write('VERDICT ' + freshness + '  GATE ' + (gate && gate.decision || 'unknown') + '\n');
  process.stdout.write(all ? 'ALL REAL CHAINS RUNNING\n' : 'CHAINS DEGRADED - see FAIL lines\n');
}
process.exit(all ? 0 : 1);