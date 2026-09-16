#!/usr/bin/env node
'use strict';

// Reference verifier adapter: re-derive a state fact through a pinned,
// read-only bridge and apply the assertion pinned in the active local profile.
//
// Contract (stdin JSON -> stdout JSON):
//   in : { ref: { id, verifier, artifact, params }, case_id, mechanism_id, run_id }
//   out: { ok: true, input_sha256, output_sha256, exit_code, observed }
//     or { ok: false, reason }
//
// The statement and assertion are pinned in the active local verifier profile,
// never in the record. The bridge adapter is also pinned by digest; a caller
// cannot replace it with an arbitrary command or an echo. The bridge owns its
// source-specific checks; the core adapter does not assume a particular external system.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const repo = process.env.AUTOARMORY_REPO || process.cwd();
const HASH = /^[a-f0-9]{64}$/i;

function canonicalize(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(function (key) {
      return JSON.stringify(key) + ':' + canonicalize(value[key]);
    }).join(',') + '}';
  }
  return JSON.stringify(value);
}
function sha256Value(value) { return crypto.createHash('sha256').update(canonicalize(value)).digest('hex'); }
function sha256Text(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function fileDigest(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function fail(reason) { process.stdout.write(JSON.stringify({ ok: false, reason: reason })); process.exit(3); }
function insideRepo(relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative)) return null;
  const base = path.resolve(repo);
  const full = path.resolve(base, relative);
  if (full !== base && !full.startsWith(base + path.sep)) return null;
  return full;
}
function readPath(value, expression) {
  if (!expression) return undefined;
  const parts = String(expression).split('.').filter(Boolean);
  let current = value;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (/^\d+$/.test(part)) current = current[Number(part)];
    else current = current[part];
  }
  return current;
}
function evaluateAssertion(observed, assertion) {
  if (!assertion || typeof assertion !== 'object') return { comparable: false, reason: 'assertion is not an object' };
  if (!assertion.op || typeof assertion.op !== 'string') return { comparable: false, reason: 'assertion.op is required' };
  const actual = readPath(observed, assertion.path);
  const comparableNumber = function (value) { return value !== null && value !== '' && Number.isFinite(Number(value)); };
  switch (assertion.op) {
    case 'eq': return { comparable: true, passed: canonicalize(actual) === canonicalize(assertion.value), actual: actual };
    case 'ne': return { comparable: true, passed: canonicalize(actual) !== canonicalize(assertion.value), actual: actual };
    case 'gt': return comparableNumber(actual) && comparableNumber(assertion.value) ? { comparable: true, passed: Number(actual) > Number(assertion.value), actual: actual } : { comparable: false, reason: 'gt requires numeric actual and expected values' };
    case 'gte': return comparableNumber(actual) && comparableNumber(assertion.value) ? { comparable: true, passed: Number(actual) >= Number(assertion.value), actual: actual } : { comparable: false, reason: 'gte requires numeric actual and expected values' };
    case 'lt': return comparableNumber(actual) && comparableNumber(assertion.value) ? { comparable: true, passed: Number(actual) < Number(assertion.value), actual: actual } : { comparable: false, reason: 'lt requires numeric actual and expected values' };
    case 'lte': return comparableNumber(actual) && comparableNumber(assertion.value) ? { comparable: true, passed: Number(actual) <= Number(assertion.value), actual: actual } : { comparable: false, reason: 'lte requires numeric actual and expected values' };
    case 'exists': return { comparable: true, passed: actual !== undefined && actual !== null, actual: actual };
    case 'nonzero': return comparableNumber(actual) ? { comparable: true, passed: Number(actual) !== 0, actual: actual } : { comparable: false, reason: 'nonzero requires a numeric actual value' };
    case 'empty': return { comparable: true, passed: actual === undefined || actual === null || actual === '' || (Array.isArray(actual) && actual.length === 0), actual: actual };
    case 'nonempty': return { comparable: true, passed: actual !== undefined && actual !== null && actual !== '' && (!Array.isArray(actual) || actual.length > 0), actual: actual };
    default: return { comparable: false, reason: 'unsupported assertion.op: ' + assertion.op };
  }
}

let payload;
try { payload = JSON.parse(fs.readFileSync(0, 'utf8')); } catch (error) { fail('invalid stdin JSON: ' + error.message); }

const verifierId = payload && payload.ref && payload.ref.verifier;
if (!verifierId) fail('ref.verifier is required');

let lock;
try { lock = JSON.parse(fs.readFileSync(path.join(repo, 'verifiers.lock.json'), 'utf8')); } catch (error) { fail('cannot read verifiers.lock.json: ' + error.message); }
const declared = (lock.verifiers || []).find(function (item) { return item.id === verifierId; });
if (!declared) fail('verifier not declared in verifiers.lock.json: ' + verifierId);
if (declared.readonly !== true) fail('verifier is not declared readonly; default deny');
if (!declared.statement) fail('verifier declares no statement; nothing to re-derive');
if (!declared.bridge || typeof declared.bridge !== 'object') fail('verifier declares no pinned bridge; default deny');

const bridgePath = insideRepo(declared.bridge.adapter);
if (!bridgePath || !fs.existsSync(bridgePath)) fail('pinned bridge adapter is missing: ' + declared.bridge.adapter);
if (!HASH.test(String(declared.bridge.adapter_sha256 || '')) || fileDigest(bridgePath) !== declared.bridge.adapter_sha256) {
  fail('pinned bridge adapter digest mismatch');
}
if (!declared.bridge.server || typeof declared.bridge.server !== 'object') fail('pinned bridge declares no server descriptor');

const bridgePayload = {
  statement: declared.statement,
  statement_sha256: sha256Text(declared.statement),
  server: declared.bridge.server
};
const result = spawnSync(process.execPath, [bridgePath, '--json'], {
  cwd: repo,
  encoding: 'utf8',
  input: JSON.stringify(bridgePayload),
  timeout: declared.timeout_ms || 60000,
  windowsHide: true
});
if (result.error) fail('pinned bridge failed to start: ' + result.error.message);
if (result.status !== 0) fail('pinned bridge exited ' + result.status + ': ' + String(result.stderr || result.stdout || '').trim().slice(0, 400));
let bridgeReport;
try { bridgeReport = JSON.parse(String(result.stdout || '').trim()); } catch (error) { fail('pinned bridge produced no JSON: ' + error.message); }
if (!bridgeReport || bridgeReport.ok !== true) fail('pinned bridge declined: ' + ((bridgeReport && bridgeReport.reason) || 'ok!=true'));
const observed = bridgeReport.observed;

let passed = false;
let exitCode = 0;
let counterexample = null;
if (declared.assertion) {
  const evaluated = evaluateAssertion(observed, declared.assertion);
  if (!evaluated.comparable) fail('invalid pinned assertion: ' + evaluated.reason);
  passed = evaluated.passed === true;
  exitCode = passed ? 0 : 1;
  if (!passed) counterexample = { kind: 'state_assertion', expected: declared.assertion.value, observed: evaluated.actual };
}

const input = {
  verifier: verifierId,
  statement: declared.statement,
  assertion: declared.assertion || null,
  bridge_adapter_sha256: declared.bridge.adapter_sha256,
  server_config_sha256: declared.bridge.server.config_sha256 || null,
  server_entry_sha256: declared.bridge.server.entry_sha256 || null
};
const output = { observed: observed, assertion: declared.assertion || null, passed: passed, exit_code: exitCode };
if (counterexample) output.counterexample = counterexample;
const report = {
  ok: true,
  verifier: verifierId,
  runner: payload.runner || null,
  broadcast: { statement: declared.statement, bridge: declared.bridge.adapter, server: declared.bridge.server.name },
  observed: observed,
  passed: passed,
  counterexample: counterexample,
  input_sha256: sha256Value(input),
  output_sha256: sha256Value(output),
  exit_code: exitCode
};
if (!HASH.test(report.input_sha256) || !HASH.test(report.output_sha256)) fail('digest computation failed');
process.stdout.write(JSON.stringify(report));
process.exit(0);
