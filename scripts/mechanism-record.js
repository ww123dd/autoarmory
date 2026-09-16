#!/usr/bin/env node
'use strict';

// Record a mechanism run from a freshly captured verifier ref.
//
// A recorded mechanism_run embeds the pinned bridge digest inside its input_sha256.
// Re-pinning a bridge (scripts/verifier-pin.js) therefore invalidates every run that
// used it, and scripts/mechanism-preflight.js blocks the commit until a run is
// recorded against the new pin. This script is that step, mechanically:
//
//   read the mechanism -> capture the ref from the active local profile ->
//   record the run -> optionally close the case -> report the verdict
//
// usage: node scripts/mechanism-record.js --mechanism <id> [--case <id>]
//        [--counterexample-kind <kind>] [--state .selfforge] [--repo <root>]
//        [--trials 3] [--actor codex] [--close] [--json]

const fs = require('fs');
const path = require('path');
const mechanism = require('../src/lib/mechanism');
const verify = require('../src/lib/verify');
const environment = require('../src/lib/environment');

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] && process.argv[index + 1].indexOf('--') !== 0 ? process.argv[index + 1] : fallback;
}
function flag(name) { return process.argv.indexOf(name) >= 0; }
function emit(payload, code) {
  if (flag('--json')) process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
  process.exit(code);
}
function fail(message) {
  if (flag('--json')) emit({ ok: false, errors: [message] }, 1);
  process.stderr.write(message + '\n');
  process.exit(1);
}

const repo = path.resolve(arg('--repo', process.cwd()));
const state = path.resolve(repo, arg('--state', path.join(repo, '.selfforge')));
const trials = Number(arg('--trials', '3'));
const mechanismId = arg('--mechanism', null);
if (!mechanismId) fail('--mechanism <id> is required');

const declared = mechanism.listMechanisms(state).find(function (item) { return item.id === mechanismId; }) || null;
if (!declared) fail('mechanism not found in ' + state + ': ' + mechanismId);
if (!declared.verifier_id) fail('mechanism declares no verifier_id: ' + mechanismId);

const casesFile = mechanism.files(state).cases;
const cases = fs.existsSync(casesFile) ? fs.readFileSync(casesFile, 'utf8').split(/\r?\n/).filter(Boolean).map(function (line) { return JSON.parse(line); }) : [];
let caseId = arg('--case', null);
if (!caseId) {
  if (cases.length !== 1) fail('--case <id> is required when the state holds ' + cases.length + ' cases');
  caseId = cases[0].id;
}
const caseRecord = cases.find(function (item) { return item.id === caseId; }) || null;
if (!caseRecord) fail('case not found in ' + state + ': ' + caseId);

const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const runId = arg('--run-id', mechanismId + '-' + stamp);
const refId = arg('--ref-id', declared.verifier_id + '-ref');
const options = { repo: repo, case_id: caseId, mechanism_id: mechanismId, run_id: runId, trials: trials };

const capture = verify.captureRefs([{ id: refId, verifier: declared.verifier_id, params: {} }], options);
if (capture.status !== 'captured') fail('ref capture failed: ' + JSON.stringify(capture.refs, null, 2));
const observed = capture.refs[0].fresh.observed;
const now = new Date().toISOString();
const run = {
  schema_version: 'autoarmory/mechanism-run/v1',
  id: runId,
  mechanism_id: mechanismId,
  case_id: caseId,
  actor: arg('--actor', 'codex'),
  evidence_refs: [capture.captured[0]],
  counterexample: {
    kind: arg('--counterexample-kind', declared.verifier_id + '_counterexample'),
    expected: caseRecord.expected_transition || true,
    observed: observed
  },
  environment_fingerprint: environment.fingerprint(repo).fingerprint,
  started_at: now,
  finished_at: now
};
if (flag('--regression')) run.regression = true;

const recorded = mechanism.recordMechanismRun(state, run, { repo: repo, trials: trials });
if (!recorded.ok) fail('recordMechanismRun failed: ' + recorded.errors.join('; '));

let closure = null;
if (flag('--close')) {
  const closed = mechanism.closeCase(state, caseId, runId, { repo: repo, trials: trials });
  if (!closed.ok) fail('closeCase failed: ' + closed.errors.join('; '));
  closure = closed.closure;
}

const status = mechanism.status(state, mechanismId, { repo: repo, trials: trials });
const report = {
  ok: true,
  run: {
    id: runId,
    mechanism_id: mechanismId,
    case_id: caseId,
    verifier: declared.verifier_id,
    result: recorded.run.result,
    exit_code: recorded.run.exit_code,
    input_sha256: recorded.run.input_sha256,
    output_sha256: recorded.run.output_sha256,
    case_sha256: recorded.run.case_sha256 || null,
    runner_id: recorded.run.runner_id || null,
    runner_sha256: recorded.run.runner_sha256 || null,
    invocation_contract_version: recorded.run.invocation_contract_version || null,
    verifier_version: recorded.run.verifier_version || null,
    observed: observed
  },
  closure: closure,
  status: status
};
if (flag('--json')) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
else process.stdout.write('recorded ' + runId + '  result=' + recorded.run.result + '  exit=' + recorded.run.exit_code + '  verdict=' + status.status + (closure ? '  closure=' + closure.id : '') + '\n');
process.exit(status.status === 'verified' || status.status === 'closed' ? 0 : 1);