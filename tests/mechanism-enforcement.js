'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const verify = require('../src/lib/verify');
const { enforceMechanism } = require('../src/lib/hook-gate');
function must(condition, message) { if (!condition) throw new Error(message); }
function write(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value, 'utf8'); }
function sha256File(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-enforcement-'));
const adapter = path.join(repo, 'scripts', 'verify', 'fixture.js');
write(adapter, [
  "'use strict';",
  "const fs = require('fs');",
  "const crypto = require('crypto');",
  "function canonicalize(value) { if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']'; if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(function (key) { return JSON.stringify(key) + ':' + canonicalize(value[key]); }).join(',') + '}'; return JSON.stringify(value); }",
  "function sha256(value) { return crypto.createHash('sha256').update(canonicalize(value)).digest('hex'); }",
  "const payload = JSON.parse(fs.readFileSync(0, 'utf8'));",
  "const fail = payload.ref && payload.ref.params && payload.ref.params.mode === 'fail';",
  "const exitCode = fail ? 1 : 0;",
  "const input = { verifier: payload.ref.verifier, fail: fail };",
  "const output = { exit_code: exitCode };",
  "process.stdout.write(JSON.stringify({ ok: true, input_sha256: sha256(input), output_sha256: sha256(output), exit_code: exitCode, observed: output }));"
].join('\n'));
write(path.join(repo, 'verifiers.lock.json'), JSON.stringify({ schema_version: 'autoarmory/verifiers-lock/v1', verifiers: [{ id: 'fixture', kind: 'fixture', version: '1.0.0', invocation_contract_version: 'autoarmory/invocation-contract/v1', readonly: true, adapter: 'scripts/verify/fixture.js', adapter_sha256: sha256File(adapter), timeout_ms: 10000 }] }, null, 2) + '\n');
const mechanism = { id: 'mechanism-first', verifier_id: 'fixture', enforcement: { point: 'stop_hook', mode: 'block', coverage: 'complete', entry: 'scripts/hook-gate.js' } };
const passRef = verify.captureRefs([{ id: 'pass', verifier: 'fixture', params: { mode: 'pass' } }], { repo: repo, trials: 1 }).captured[0];
const pass = enforceMechanism({ kind: 'completion', evidence_refs: [passRef] }, mechanism, { repo: repo, trials: 1 });
must(pass.decision === 'allow' && pass.ok === true, 'passing completion evidence must be allowed');
const failRef = verify.captureRefs([{ id: 'fail', verifier: 'fixture', params: { mode: 'fail' } }], { repo: repo, trials: 1 }).captured[0];
const fail = enforceMechanism({ kind: 'completion', evidence_refs: [failRef] }, mechanism, { repo: repo, trials: 1 });
must(fail.decision === 'block' && /verification failed/.test(fail.reason), 'failing completion evidence must be blocked');
const missing = enforceMechanism({ kind: 'completion', evidence_refs: [] }, mechanism, { repo: repo, trials: 1 });
must(missing.decision === 'block' && /no evidence refs/.test(missing.reason), 'completion without evidence refs must be blocked');
const advisory = enforceMechanism({ kind: 'completion' }, { verifier_id: 'fixture', enforcement: { mode: 'advisory', coverage: 'partial' } }, { repo: repo });
must(advisory.decision === 'allow' && /advisory/.test(advisory.reason), 'incomplete enforcement must not pretend to block');
const state = path.join(repo, '.selfforge');
write(path.join(state, 'mechanisms.jsonl'), JSON.stringify(mechanism) + '\n');
const eventFile = path.join(repo, 'completion.json');
write(eventFile, JSON.stringify({ kind: 'completion', evidence_refs: [passRef] }) + '\n');
const cli = path.resolve(__dirname, '..', 'scripts', 'hook-gate.js');
const cliPass = require('child_process').spawnSync(process.execPath, [cli, '--event', eventFile, '--state', state, '--repo', repo, '--mechanism', mechanism.id, '--json'], { encoding: 'utf8' });
must(cliPass.status === 0 && JSON.parse(cliPass.stdout).decision === 'allow', 'hook gate CLI must allow a mechanism with passing evidence');
write(eventFile, JSON.stringify({ kind: 'completion', evidence_refs: [failRef] }) + '\n');
const cliFail = require('child_process').spawnSync(process.execPath, [cli, '--event', eventFile, '--state', state, '--repo', repo, '--mechanism', mechanism.id, '--json'], { encoding: 'utf8' });
must(cliFail.status === 2 && JSON.parse(cliFail.stdout).decision === 'block', 'hook gate CLI must block a mechanism with failing evidence');
console.log('mechanism enforcement tests passed: pass allow, fail/block, missing evidence block, advisory no overclaim');

