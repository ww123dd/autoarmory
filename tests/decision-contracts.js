'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const fixtureHelper = require('./helpers/mechanism-fixture');

function must(condition, message) { if (!condition) throw new Error(message); }
const repo = path.resolve(__dirname, '..');
const gate = require(path.join(repo, 'src', 'lib', 'load-gate'));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-decision-contracts-'));
const state = path.join(temp, 'state');
fs.mkdirSync(path.join(state, 'reuse-records'), { recursive: true });
const NOW = '2026-09-19T00:00:00.000Z';

// 1. versioned policy: default ships, state-root override wins, incomplete override fails closed.
const policy = gate.loadPolicy(state);
must(policy.version === 1 && policy.classes.indexOf('publish') !== -1 && policy.mode.load === 'observe' && policy.mode.publish === 'enforce', 'default policy v1 must ship with per-class modes');
fs.writeFileSync(path.join(state, 'decision-policy.json'), JSON.stringify({ schema_version: 'autoarmory/decision-policy/v1', version: 2, classes: ['publish', 'load'], mode: { publish: 'enforce', load: 'enforce' }, rules: { publish: { '*': 'block', 'valid-pass': 'allow' }, load: { '*': 'degrade', 'valid-pass': 'allow' } } }));
must(gate.loadPolicy(state).version === 2, 'state-root policy override must be honored');
fs.writeFileSync(path.join(state, 'decision-policy.json'), '{"schema_version":"autoarmory/decision-policy/v1","version":3}');
let threw = false;
try { gate.loadPolicy(state); } catch (_) { threw = true; }
must(threw, 'incomplete policy override must fail closed');
fs.unlinkSync(path.join(state, 'decision-policy.json'));

// 2. unknown action class must fail closed and be logged even without a repo.
let r = gate.consultAction(state, { actionClass: 'teleport', at: NOW, consumerRef: 'c1', repo: repo });
must(r.behavior === 'block' && r.reason_code === 'unknown_action_class', 'unknown action class must fail closed');

// 3. publish (enforce): block without verdict; allow only on a mechanism-status valid pass.
r = gate.consultAction(state, { actionClass: 'publish', changeId: 'missing', at: NOW, consumerRef: 'release-job', repo: repo });
must(r.behavior === 'block' && r.verdict_state === 'no-verdict' && r.mode === 'enforce', 'publish without verdict must block');

const valid = fixtureHelper.createFixture(temp, 'valid');
fixtureHelper.registerCaseAndMechanism(valid);
const run = fixtureHelper.recordRun(valid, 'run-valid');
const closure = fixtureHelper.closeRun(valid, run);
const validRecord = fixtureHelper.reuseRecord(valid, 'rel-valid', { run: run, closure: closure });
r = gate.consultAction(valid.state, { actionClass: 'publish', changeId: 'rel-valid', at: NOW, consumerRef: 'release-job', repo: valid.repo, decisionId: validRecord.decision_id });
must(r.behavior === 'allow' && r.verdict_state === 'valid-pass', 'correct mechanism status must allow publish');

fs.writeFileSync(path.join(state, 'reuse-records', 'rel-legacy.json'), JSON.stringify({ change_id: 'rel-legacy', status: 'closed', verifier: 'tableau-release-zip', run: { result: 'pass' } }));
r = gate.consultAction(state, { actionClass: 'publish', changeId: 'rel-legacy', at: NOW, consumerRef: 'release-job', repo: repo });
must(r.behavior === 'block' && r.verdict_state === 'superseded', 'legacy closed verdict must block publish');

fs.writeFileSync(path.join(state, 'reuse-records', 'rel-old.json'), JSON.stringify({ change_id: 'rel-old', status: 'closed', run: { result: 'pass' }, expires_at: '2000-01-01T00:00:00.000Z' }));
r = gate.consultAction(state, { actionClass: 'publish', changeId: 'rel-old', at: NOW, repo: repo });
must(r.behavior === 'block' && r.verdict_state === 'expired', 'expired evidence must block publish');

fs.writeFileSync(path.join(state, 'reuse-records', 'rel-ret.json'), JSON.stringify({ change_id: 'rel-ret', status: 'retired' }));
r = gate.consultAction(state, { actionClass: 'publish', changeId: 'rel-ret', at: NOW, repo: repo });
must(r.behavior === 'block' && r.verdict_state === 'retired', 'retired verdict must block publish');

// 4. load (observe): record-only pass-through with would_behavior accumulating the flip case.
r = gate.consultAction(state, { actionClass: 'load', changeId: 'missing', at: NOW, repo: repo });
must(r.behavior === 'observe' && r.would_behavior === 'degrade', 'observe load must pass through and record would-degrade');
r = gate.consultAction(state, { actionClass: 'load', changeId: 'rel-ret', at: NOW, repo: repo });
must(r.behavior === 'observe' && r.would_behavior === 'block', 'observe load over a retired verdict must record would-block');

// 5. scoped invariants.
const v = gate.violations(state);
must(v.enforce_gate_hole_count === 0, 'enforce gate hole invariant must hold by construction');
must(v.observe_would_block_count === 1, 'observe would-block must be counted exactly');

// 6. fact refresh: each record is recalculated through mechanism.status, then
// materialised. A legacy closed record is superseded, not silently valid-pass.
const refreshState = path.join(temp, 'refresh-state');
fs.mkdirSync(path.join(refreshState, 'reuse-records'), { recursive: true });
fs.cpSync(path.join(valid.state, 'reuse-records'), path.join(refreshState, 'reuse-records'), { recursive: true });
fs.copyFileSync(path.join(valid.state, 'cases.jsonl'), path.join(refreshState, 'cases.jsonl'));
fs.copyFileSync(path.join(valid.state, 'mechanisms.jsonl'), path.join(refreshState, 'mechanisms.jsonl'));
fs.copyFileSync(path.join(valid.state, 'mechanism-runs.jsonl'), path.join(refreshState, 'mechanism-runs.jsonl'));
fs.copyFileSync(path.join(valid.state, 'closures.jsonl'), path.join(refreshState, 'closures.jsonl'));
fs.writeFileSync(path.join(refreshState, 'reuse-records', 'rel-legacy.json'), JSON.stringify({ change_id: 'rel-legacy', status: 'closed', verifier: 'fixture', run: { result: 'pass' } }));
const rr = gate.refresh(refreshState, NOW, { repo: valid.repo });
must(rr.decisions === 2 && rr.valid_pass === 1 && rr.superseded === 1, 'refresh must classify valid pass and legacy supersession separately');
const rr2 = gate.refresh(refreshState, NOW, { repo: valid.repo });
must(rr2.transitions === 0, 'second refresh with no change must be a no-op');
const events = fs.readFileSync(path.join(refreshState, 'verdict-events.jsonl'), 'utf8').trim().split('\n').map(function (line) { return JSON.parse(line); });
must(events.length === 2 && events.every(function (x) { return x.schema_version === 'autoarmory/verdict-event/v1' && x.from === null; }), 'verdict events must be typed with from=null on first observation');
const snap = JSON.parse(fs.readFileSync(path.join(refreshState, 'decision-state.json'), 'utf8'));
must(snap.schema_version === 'autoarmory/decision-state/v1' && snap.decisions.length === 2, 'refresh must materialise the decision-state snapshot');

// 7. legacy risk-based consult requires explicit repo/state and still blocks legacy records.
r = gate.consult(valid.state, 'rel-valid', { risk: 'high', repo: valid.repo, decisionId: validRecord.decision_id });
must(r.decision === 'allow' && r.verifier === 'fixture', 'legacy consult must keep working for valid records');
r = gate.consult(state, 'rel-legacy', { risk: 'high', repo: repo });
must(r.decision === 'block' && r.verdict === 'superseded', 'legacy consult must reject historical closed records');

console.log('decision contracts tests passed: policy table, mechanism-status authority, consumption log, refresh, explicit repo');