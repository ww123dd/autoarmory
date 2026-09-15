#!/usr/bin/env node
'use strict';

// Reference verifier adapter: re-derive a state fact by querying the live system
// and applying the assertion pinned in verifiers.lock.json.
//
// Contract (stdin JSON -> stdout JSON):
//   in : { ref: { id, verifier, artifact, params }, case_id, mechanism_id, run_id }
//   out: { ok: true, input_sha256, output_sha256, exit_code, observed }
//     or { ok: false, reason }
//
// The statement being re-derived is pinned in verifiers.lock.json, never in the
// record, so a caller cannot narrow the query until it agrees with the claim. The
// assertion is pinned for the same reason: a caller cannot redefine "pass" after
// seeing the observed value. A bridge command must be provided through the
// environment variable named in the lock entry. If it is missing the adapter
// declines - the caller then gets `unverifiable`, never `verified` (default deny:
// an unconfigured verifier must not silently pass).

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
function fail(reason) { process.stdout.write(JSON.stringify({ ok: false, reason: reason })); process.exit(3); }
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

const bridgeName = declared.bridge_env || 'AUTOARMORY_STATE_CMD';
const bridge = process.env[bridgeName];
if (!bridge) fail('no state bridge: set ' + bridgeName + ' to a read-only command that returns the query result on stdout');

const result = spawnSync(bridge, { shell: true, cwd: repo, encoding: 'utf8', input: declared.statement + '\n', timeout: declared.timeout_ms || 60000 });
if (result.error) fail('state bridge failed to start: ' + result.error.message);
if (result.status !== 0) fail('state bridge exited ' + result.status + ': ' + String(result.stderr || '').trim().slice(0, 240));
const raw = String(result.stdout || '');
if (!raw.trim()) fail('state bridge returned nothing on stdout for: ' + declared.statement);

let observed;
try { observed = JSON.parse(raw.trim()); } catch (error) { observed = raw.trim(); }

let passed = false;
let exitCode = 0;
let counterexample = null;
if (declared.assertion) {
  const evaluated = evaluateAssertion(observed, declared.assertion);
  if (!evaluated.comparable) fail('invalid pinned assertion: ' + evaluated.reason);
  passed = evaluated.passed === true;
  exitCode = passed ? 0 : 1;
  if (!passed) counterexample = { kind: 'state_assertion', expected: declared.assertion.value, observed: evaluated.actual };
} else {
  passed = true;
  exitCode = 0;
}

const input = { verifier: verifierId, statement: declared.statement, assertion: declared.assertion || null };
const output = { observed: observed, assertion: declared.assertion || null, passed: passed, exit_code: exitCode };
if (counterexample) output.counterexample = counterexample;
const report = {
  ok: true,
  verifier: verifierId,
  broadcast: { statement: declared.statement, bridge: bridgeName },
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
