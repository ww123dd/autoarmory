'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
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

// Integration check for the pinned MCP bridge: state-query must invoke the
// pinned bridge, not an environment-provided shell command.
function makeMcpFixture(name, count) {
  const repo = path.join(root, name);
  const scripts = path.join(repo, 'scripts', 'verify');
  fs.mkdirSync(scripts, { recursive: true });
  const stateQueryPath = path.join(scripts, 'state-query.js');
  const bridgePath = path.join(scripts, 'doris-mcp-bridge.js');
  write(stateQueryPath, fs.readFileSync(path.join(__dirname, '..', 'scripts', 'verify', 'state-query.js'), 'utf8'));
  write(bridgePath, fs.readFileSync(path.join(__dirname, '..', 'scripts', 'verify', 'doris-mcp-bridge.js'), 'utf8'));
  const serverPath = path.join(repo, 'fixture-mcp.js');
  write(serverPath, [
    "'use strict';",
    "const readline = require('readline');",
    "const rl = readline.createInterface({ input: process.stdin });",
    "function send(message) { process.stdout.write(JSON.stringify(message) + '\\n'); }",
    "rl.on('line', function (line) {",
    "  let message; try { message = JSON.parse(line); } catch (_) { return; }",
    "  if (message.method === 'initialize') {",
    "    send({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1.0.0' } } });",
    "  } else if (message.method === 'tools/call') {",
    "    send({ jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: JSON.stringify([{ cnt: Number(process.env.FIXTURE_COUNT || '0') }]) }], isError: false } });",
    "  }",
    "});"
  ].join('\n'));
  const configPath = path.join(repo, 'mcp.json');
  const config = {
    mcpServers: {
      doris: {
        command: process.execPath,
        args: [serverPath],
        env: { MYSQL_HOST: 'fixture', MYSQL_PORT: '3306', MYSQL_USER: 'readonly_aa', MYSQL_PASS: 'fixture', MYSQL_DB: 'fixture', FIXTURE_COUNT: String(count) }
      }
    }
  };
  write(configPath, JSON.stringify(config, null, 2) + '\n');
  const lock = {
    schema_version: 'autoarmory/verifiers-lock/v1',
    verifiers: [{
      id: 'fixture-doris',
      kind: 'doris-mcp-readonly',
      readonly: true,
      adapter: 'scripts/verify/state-query.js',
      adapter_sha256: sha256File(stateQueryPath),
      statement: 'SELECT COUNT(*) AS cnt FROM fixture.table',
      assertion: { path: 'cnt', op: 'eq', value: 0 },
      timeout_ms: 30000,
      bridge: {
        adapter: 'scripts/verify/doris-mcp-bridge.js',
        adapter_sha256: sha256File(bridgePath),
        server: {
          name: 'doris',
          tool: 'mysql_query',
          user: 'readonly_aa',
          config: 'mcp.json',
          config_sha256: sha256File(configPath),
          entry: serverPath,
          entry_sha256: sha256File(serverPath)
        }
      }
    }]
  };
  write(path.join(repo, 'verifiers.lock.json'), JSON.stringify(lock, null, 2) + '\n');
  return repo;
}
let mcpRepo = makeMcpFixture('mcp-dirty', 4998287);
let mcpCapture = verify.captureRefs([{ id: 'mcp-dirty', verifier: 'fixture-doris' }], { repo: mcpRepo });
must(mcpCapture.status === 'captured' && mcpCapture.captured[0].exit_code === 1, 'pinned MCP bridge must re-derive dirty state');
let mcpVerified = verify.verifyRefs(mcpCapture.captured, { repo: mcpRepo });
must(mcpVerified.status === 'verified' && mcpVerified.exit_code === 1, 'pinned MCP ref must verify');

mcpRepo = makeMcpFixture('mcp-clean', 0);
mcpCapture = verify.captureRefs([{ id: 'mcp-clean', verifier: 'fixture-doris' }], { repo: mcpRepo });
must(mcpCapture.status === 'captured' && mcpCapture.captured[0].exit_code === 0, 'pinned MCP bridge must pass clean state');

mcpRepo = makeMcpFixture('mcp-config-tamper', 0);
fs.appendFileSync(path.join(mcpRepo, 'mcp.json'), '\n', 'utf8');
mcpCapture = verify.captureRefs([{ id: 'mcp-tamper', verifier: 'fixture-doris' }], { repo: mcpRepo });
must(mcpCapture.status === 'unverifiable' && /config digest mismatch/.test(JSON.stringify(mcpCapture.refs)), 'MCP config drift must be unverifiable');

const verifierList = verify.listVerifiers(path.resolve(__dirname, '..'));
const pinned = verifierList.verifiers.find(function (item) { return item.id === 'doris-readonly-count'; });
must(verifierList.ok && pinned && pinned.integrity === true, 'reference adapter must match verifiers.lock.json');

console.log('verification tests passed: capture, verified, missing-verifier=unverifiable, no-refs=unverifiable, missing-hash=unverifiable, adapter-tamper=mismatch, record-mismatch=mismatch, adapter-exit=unverifiable, pinned-assertion=tested');
