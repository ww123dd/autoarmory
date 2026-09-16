'use strict';

// Regression test for the mechanical trust-root path.
//
// The lock is deliberately frozen against hand edits (the Codex guard blocks
// Write/Edit and shell redirection into verifiers.lock.json). Declaring a new
// verifier therefore has to be mechanical: write a descriptor, let
// scripts/verifier-pin.js recompute the digests and rewrite both halves of the
// trust root. This test proves that path works and still fails closed on drift.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PIN = path.join(ROOT, 'scripts', 'verifier-pin.js');
const CONTRACT = 'autoarmory/invocation-contract/v1';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-verifier-pin-'));

function must(condition, message) { if (!condition) throw new Error(message); }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function write(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value, 'utf8'); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

function makeRepo(name) {
  const repo = path.join(work, name);
  write(path.join(repo, 'scripts', 'verify', 'state-query.js'), "'use strict';\n");
  write(path.join(repo, 'examples', 'adapters', 'fixture-bridge', 'bridge.js'), "'use strict';\n// fixture bridge\n");
  write(path.join(repo, 'verifiers.lock.json'), JSON.stringify({
    schema_version: 'autoarmory/verifiers-lock/v1',
    verifiers: [{
      id: 'fixture-runner',
      kind: 'fixture',
      version: '1.0.0',
      invocation_contract_version: CONTRACT,
      readonly: true,
      adapter: 'scripts/verify/state-query.js',
      adapter_sha256: '',
      statement: 'fixture statement',
      timeout_ms: 10000
    }]
  }, null, 2) + '\n');
  const anchor = path.join(work, name + '-anchor', 'verifier-lock.sha256');
  return { repo: repo, lock: path.join(repo, 'verifiers.lock.json'), anchor: anchor };
}

function pin(fixture, args) {
  return spawnSync(process.execPath, [PIN].concat(args || []), {
    cwd: fixture.repo,
    encoding: 'utf8',
    env: Object.assign({}, process.env, { AUTOARMORY_LOCK_ANCHOR: fixture.anchor }),
    windowsHide: true
  });
}
function assertFullyPinned(fixture, label) {
  const dry = pin(fixture, ['--dry-run']);
  must(dry.status === 0, label + ': dry run must succeed: ' + String(dry.stderr || dry.stdout).slice(0, 300));
  const match = String(dry.stdout).match(/next lock digest ([a-f0-9]{64})/);
  must(match, label + ': dry run must report a digest');
  const onDisk = sha256(fs.readFileSync(fixture.lock));
  must(match[1] === onDisk, label + ': dry run digest must reproduce the lock on disk');
  must(fs.readFileSync(fixture.anchor, 'utf8').trim() === onDisk, label + ': the external anchor must carry the lock digest');
  return onDisk;
}

// 1. Bootstrap: pinning an empty profile stamps the lock and the external anchor.
let fixture = makeRepo('bootstrap');
let result = pin(fixture);
must(result.status === 0, 'bootstrap pin must succeed: ' + String(result.stderr || result.stdout).slice(0, 300));
assertFullyPinned(fixture, 'bootstrap');
const bootstrapped = readJson(fixture.lock).verifiers[0];
must(bootstrapped.adapter_sha256 === sha256(fs.readFileSync(path.join(fixture.repo, 'scripts', 'verify', 'state-query.js'))), 'bootstrap must pin the adapter digest');

// 2. Declare a new verifier from a descriptor: no hand edit of the lock.
const descriptor = path.join(work, 'descriptor.json');
write(descriptor, JSON.stringify([{
  id: 'fixture-second',
  kind: 'fixture',
  version: '2.0.0',
  invocation_contract_version: CONTRACT,
  readonly: true,
  adapter: 'scripts/verify/state-query.js',
  adapter_sha256: 'stale-digest-from-a-draft-is-ignored',
  statement: 'second statement',
  assertion: { path: 'count', op: 'gte', value: 3 },
  timeout_ms: 10000,
  bridge: {
    adapter: 'examples/adapters/fixture-bridge/bridge.js',
    adapter_sha256: '',
    server: { name: 'fixture', readonly: true }
  }
}], null, 2) + '\n');
result = pin(fixture, ['--merge', descriptor]);
must(result.status === 0, 'declaring a verifier must succeed: ' + String(result.stderr || result.stdout).slice(0, 300));
const merged = readJson(fixture.lock);
must(merged.verifiers.length === 2 && merged.verifiers[1].id === 'fixture-second', 'merge must append the declared verifier');
must(merged.verifiers[1].adapter_sha256 === sha256(fs.readFileSync(path.join(fixture.repo, 'scripts', 'verify', 'state-query.js'))), 'merge must recompute the adapter digest instead of trusting the draft');
must(merged.verifiers[1].bridge.adapter_sha256 === sha256(fs.readFileSync(path.join(fixture.repo, 'examples', 'adapters', 'fixture-bridge', 'bridge.js'))), 'merge must recompute the bridge digest');
assertFullyPinned(fixture, 'after merge');

// 3. Fail closed on drift: a hand-edited lock must not be papered over.
const drifted = readJson(fixture.lock);
drifted.verifiers[1].assertion.value = 999;
write(fixture.lock, JSON.stringify(drifted, null, 2) + '\n');
result = pin(fixture, ['--merge', descriptor]);
must(result.status === 2 && /VERIFIER_PIN_BLOCK/.test(result.stderr) && /trust root drift/.test(result.stderr), 'a drifted lock must be refused without --allow-drift');
result = pin(fixture, ['--merge', descriptor, '--allow-drift']);
must(result.status === 0, 'deliberate recovery must succeed with --allow-drift: ' + String(result.stderr || result.stdout).slice(0, 300));
must(readJson(fixture.lock).verifiers[1].assertion.value === 3, 'recovery must restore the declared assertion from the descriptor');
assertFullyPinned(fixture, 'after recovery');

// 4. A declaration without the runner metadata is refused, not defaulted silently.
const incomplete = path.join(work, 'incomplete.json');
write(incomplete, JSON.stringify([{ id: 'fixture-third', kind: 'fixture', readonly: true, adapter: 'scripts/verify/state-query.js', adapter_sha256: '', statement: 'x', timeout_ms: 10000 }], null, 2) + '\n');
result = pin(fixture, ['--merge', incomplete]);
must(result.status === 2 && /verifier\.version must be declared/.test(result.stderr), 'a declaration without version must be refused');

// 5. A pin on an uncommitted artifact is refused by default and only allowed when it
//    is explicitly declared as a local instrument - and then it has to be reported.
const gitFixture = makeRepo('untracked-pin');
spawnSync('git', ['init', '--quiet'], { cwd: gitFixture.repo, windowsHide: true });
spawnSync('git', ['add', 'scripts/verify/state-query.js'], { cwd: gitFixture.repo, windowsHide: true });
const localInstrument = path.join(work, 'local-instrument.json');
write(localInstrument, JSON.stringify([{
  id: 'fixture-untracked-bridge', kind: 'fixture', version: '1.0.0', invocation_contract_version: CONTRACT, readonly: true,
  adapter: 'scripts/verify/state-query.js', adapter_sha256: '', statement: 'local instrument', timeout_ms: 10000,
  bridge: { adapter: 'examples/adapters/fixture-bridge/bridge.js', adapter_sha256: '', server: { name: 'fixture' } }
}], null, 2) + '\n');
result = pin(gitFixture, ['--merge', localInstrument]);
must(result.status === 2 && /is not committed/.test(result.stderr), 'an uncommitted pinned artifact must be refused by default: ' + String(result.stderr || '').slice(0, 200));
result = pin(gitFixture, ['--merge', localInstrument, '--allow-untracked']);
must(result.status === 0, '--allow-untracked must land the local instrument: ' + String(result.stderr || result.stdout).slice(0, 300));
must(/local instruments \(pins not reproducible from a clone\): fixture-untracked-bridge/.test(result.stdout), 'the local instrument must be reported, not silently accepted');
assertFullyPinned(gitFixture, 'with a local instrument');

console.log('verifier pin tests passed: bootstrap, declare-from-descriptor, drift=fail-closed, allow-drift=recovery, incomplete=refused, local-instrument=refused-without-flag-and-reported');