'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const verify = require('../src/lib/verify');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-verification-'));
function must(condition, message) { if (!condition) throw new Error(message); }
function sha256File(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function write(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value, 'utf8'); }
function adapterSource(options) {
  const mode = options && options.mode ? options.mode : 'normal';
  const exitCode = options && options.exitCode !== undefined ? options.exitCode : 0;
  return [
    "'use strict';",
    "const fs = require('fs');",
    "const crypto = require('crypto');",
    "function canonicalize(value) { if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']'; if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(function (key) { return JSON.stringify(key) + ':' + canonicalize(value[key]); }).join(',') + '}'; return JSON.stringify(value); }",
    "function sha256(value) { return crypto.createHash('sha256').update(canonicalize(value)).digest('hex'); }",
    "const payload = JSON.parse(fs.readFileSync(0, 'utf8'));",
    "const fail = payload.ref && payload.ref.params && payload.ref.params.mode === 'fail';",
    "const observed = fail ? 4998287 : 0;",
    "const exitCode = fail ? 1 : 0;",
    "const input = { verifier: payload.ref.verifier, observed: observed };",
    "const output = { observed: observed, exit_code: exitCode };",
    "process.stdout.write(JSON.stringify({ ok: true, input_sha256: sha256(input), output_sha256: sha256(output), exit_code: exitCode, observed: observed }));",
    "process.exit(" + exitCode + ");"
  ].join('\n');
}
function makeRepo(name, options) {
  const repo = path.join(root, name);
  const adapter = path.join(repo, 'scripts', 'verify', 'fixture.js');
  write(adapter, adapterSource(options));
  const lock = {
    schema_version: 'autoarmory/verifiers-lock/v1',
    verifiers: [{ id: 'fixture', kind: 'fixture', readonly: true, adapter: 'scripts/verify/fixture.js', adapter_sha256: sha256File(adapter), timeout_ms: 10000 }]
  };
  write(path.join(repo, 'verifiers.lock.json'), JSON.stringify(lock, null, 2) + '\n');
  return repo;
}
function ref(id, mode) { return { id: id, verifier: 'fixture', params: { mode: mode || 'pass' } }; }
function recordFor(captured) {
  return {
    schema_version: 'autoarmory/mechanism-run/v1',
    id: 'run-' + captured.id,
    evidence_refs: [captured],
    result: captured.exit_code === 0 ? 'pass' : 'fail',
    input_sha256: captured.input_sha256,
    output_sha256: captured.output_sha256,
    exit_code: captured.exit_code,
    counterexample: { kind: 'fixture', expected: 0, observed: captured.exit_code === 0 ? 0 : 4998287 }
  };
}

let repo = makeRepo('valid');
let capture = verify.captureRefs([ref('valid')], { repo: repo });
must(capture.status === 'captured' && capture.captured.length === 1, 'capture must derive a replayable ref');
let result = verify.verifyRefs(capture.captured, { repo: repo });
must(result.status === 'verified' && result.result === 'pass', 'captured ref must verify and derive pass');
must(verify.verifyRecord(recordFor(capture.captured[0]), { repo: repo }).status === 'verified', 'record with re-derived hashes must verify');

repo = makeRepo('missing-verifier');
capture = verify.captureRefs([{ id: 'missing', verifier: 'not-registered' }], { repo: repo });
must(capture.status === 'unverifiable', 'missing verifier must be unverifiable');
result = verify.verifyRefs([{ id: 'missing', verifier: 'not-registered', input_sha256: '0'.repeat(64), output_sha256: '0'.repeat(64), exit_code: 0 }], { repo: repo });
must(result.status === 'unverifiable', 'missing verifier must fail verification');

repo = makeRepo('missing-refs');
result = verify.verifyRefs([], { repo: repo });
must(result.status === 'unverifiable', 'no refs must be unverifiable');
result = verify.verifyRecord({ evidence_refs: [], verification: { independent: true, verifier_id: 'self' }, input_sha256: '0'.repeat(64), output_sha256: '0'.repeat(64), exit_code: 0, result: 'pass' }, { repo: repo });
must(result.status === 'unverifiable' && /no evidence refs/.test(result.reason), 'self-reported verification must not create verification');

repo = makeRepo('missing-hashes');
result = verify.verifyRefs([ref('missing-hashes')], { repo: repo });
must(result.status === 'unverifiable' && /input_sha256/.test(JSON.stringify(result.checks)), 'ref without recorded hashes must be unverifiable');

repo = makeRepo('tampered-adapter');
capture = verify.captureRefs([ref('tampered')], { repo: repo });
fs.appendFileSync(path.join(repo, 'scripts', 'verify', 'fixture.js'), '\n// tampered\n', 'utf8');
result = verify.verifyRefs(capture.captured, { repo: repo });
must(result.status === 'mismatch' && /adapter_integrity/.test(JSON.stringify(result.checks)), 'tampered adapter must be mismatch');

repo = makeRepo('mismatched-record');
capture = verify.captureRefs([ref('mismatch')], { repo: repo });
const mismatched = recordFor(capture.captured[0]);
mismatched.input_sha256 = 'f'.repeat(64);
result = verify.verifyRecord(mismatched, { repo: repo });
must(result.status === 'mismatch' && /input_sha256/.test(result.reason), 'record hash mismatch must be rejected');

repo = makeRepo('adapter-exit');
const failingAdapter = path.join(repo, 'scripts', 'verify', 'fixture.js');
write(failingAdapter, adapterSource({ mode: 'exit' }).replace("process.exit(0);", "process.exit(2);"));
const failingLock = JSON.parse(fs.readFileSync(path.join(repo, 'verifiers.lock.json'), 'utf8'));
failingLock.verifiers[0].adapter_sha256 = sha256File(failingAdapter);
write(path.join(repo, 'verifiers.lock.json'), JSON.stringify(failingLock, null, 2) + '\n');
result = verify.captureRefs([ref('adapter-exit')], { repo: repo });
must(result.status === 'unverifiable' && /exited 2/.test(JSON.stringify(result.refs)), 'nonzero adapter exit must be unverifiable');

// Integration check for the pinned reference adapter itself: the judge must not
// trust a caller-provided assertion or a stale bridge result.
const repoRoot = path.resolve(__dirname, '..');
const stateQuery = path.join(repoRoot, 'scripts', 'verify', 'state-query.js');
const bridge = path.join(root, 'state-query-bridge.js');
write(bridge, [
  "'use strict';",
  "let input = '';",
  "process.stdin.on('data', function (chunk) { input += chunk; });",
  "process.stdin.on('end', function () { process.stdout.write(JSON.stringify({ cnt: Number(process.env.FIXTURE_COUNT || '0') })); });"
].join('\n'));
function runStateQuery(count, includeBridge, params) {
  const env = Object.assign({}, process.env, { AUTOARMORY_REPO: repoRoot, FIXTURE_COUNT: String(count) });
  if (includeBridge) env.AUTOARMORY_DORIS_MCP_CMD = '"' + process.execPath + '" "' + bridge + '"';
  else { delete env.AUTOARMORY_DORIS_MCP_CMD; delete env.AUTOARMORY_STATE_CMD; }
  return spawnSync(process.execPath, [stateQuery, '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
    input: JSON.stringify({ ref: { id: 'adapter', verifier: 'doris-readonly-count', params: params || {} }, case_id: 'case', mechanism_id: 'mech', run_id: 'run' }),
    env: env
  });
}
let adapterResult = runStateQuery(4998287, true, { assertion: { op: 'exists' } });
must(adapterResult.status === 0, 'pinned state adapter must start');
let adapterReport = JSON.parse(adapterResult.stdout);
must(adapterReport.exit_code === 1 && adapterReport.passed === false && adapterReport.counterexample.observed === 4998287, 'pinned assertion must override caller params and fail on count>0');
adapterResult = runStateQuery(0, true, { assertion: { op: 'exists' } });
adapterReport = JSON.parse(adapterResult.stdout);
must(adapterResult.status === 0 && adapterReport.exit_code === 0 && adapterReport.passed === true, 'pinned assertion must pass on count=0');
adapterResult = runStateQuery(4998287, false, {});
must(adapterResult.status !== 0 && /no state bridge/.test(adapterResult.stdout), 'missing bridge must be unverifiable, never pass');
const verifierList = verify.listVerifiers(repoRoot);
const pinned = verifierList.verifiers.find(function (item) { return item.id === 'doris-readonly-count'; });
must(verifierList.ok && pinned && pinned.integrity === true, 'reference adapter must match verifiers.lock.json');

console.log('verification tests passed: capture, verified, missing-verifier=unverifiable, no-refs=unverifiable, missing-hash=unverifiable, adapter-tamper=mismatch, record-mismatch=mismatch, adapter-exit=unverifiable, pinned-assertion=tested');
