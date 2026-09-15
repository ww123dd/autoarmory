'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const gate = path.resolve(__dirname, '..', 'scripts', 'change-gate.js');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-change-gate-'));

function git(repo, args) {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  if (result.status !== 0) throw new Error('git ' + args.join(' ') + ': ' + (result.stderr || '').trim());
  return result.stdout || '';
}
function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}
function repo(name) {
  const dir = path.join(temp, name);
  fs.mkdirSync(dir, { recursive: true });
  git(dir, ['init']);
  git(dir, ['config', 'user.name', 'Test']);
  git(dir, ['config', 'user.email', 'test@example.invalid']);
  write(path.join(dir, 'README.md'), '# Fixture\n');
  write(path.join(dir, 'src', 'commands', 'existing.js'), "'use strict';\n");
  write(path.join(dir, 'src', 'lib', 'mechanism.js'), "'use strict';\nmodule.exports = {};\n");
  git(dir, ['add', '.']);
  git(dir, ['commit', '-m', 'baseline']);
  return dir;
}
function run(repoDir) {
  const result = spawnSync(process.execPath, [gate, '--repo', repoDir, '--staged', '--json'], { encoding: 'utf8' });
  return { code: result.status, out: result.stdout || '', err: result.stderr || '' };
}
function must(condition, message) {
  if (!condition) {
    console.error('FAIL: ' + message);
    process.exit(1);
  }
}
function claim() {
  return JSON.stringify({
    claim: 'new command emits a deterministic decision record',
    claim_level: 'L5',
    consumer: 'CI adapter',
    consumption_moment: 'before merging a change',
    decision: 'allow or block the merge',
    action: 'block',
    enforcement_point: 'pre-merge CI job',
    can_block: true,
    status: 'enforced',
    fallback: 'stop and ask the operator',
    policy_version: 'v1',
    expires_at: '2026-12-31',
    outcome_callback: 'write the result and decision id to outcomes.jsonl',
    evidence: [
      { type: 'first_hand', ref: 'local CI run', reproducible: true },
      { type: 'production_outcome', ref: 'one real merge-blocking result', reproducible: true }
    ],
    counterexample: 'missing consumer must BLOCK',
    reproduction: 'node tests/change-gate.js'
  }, null, 2) + '\n';
}

let dir = repo('new-command-no-claim');
write(path.join(dir, 'src', 'commands', 'new.js'), "'use strict';\n");
git(dir, ['add', 'src/commands/new.js']);
let result = run(dir);
must(result.code === 2 && result.out.includes('new abstraction'), 'new command without claim must BLOCK');

dir = repo('new-command-with-claim');
write(path.join(dir, 'src', 'commands', 'new.js'), "'use strict';\n");
write(path.join(dir, 'claims', 'new-command.json'), claim());
git(dir, ['add', 'src/commands/new.js', 'claims/new-command.json']);
result = run(dir);
must(result.code === 2 && result.out.includes('"verdict": "BLOCK"'), 'new command with claim but no removal must BLOCK');

dir = repo('new-command-with-improvement');
write(path.join(dir, 'src', 'commands', 'new.js'), "'use strict';\n");
write(path.join(dir, 'src', 'lib', 'mechanism.js'), "'use strict';\nmodule.exports = { input_sha256: true, output_sha256: true };\n");
git(dir, ['add', 'src/commands/new.js', 'src/lib/mechanism.js']);
result = run(dir);
must(result.code === 2 && result.out.includes('"verdict": "BLOCK"'), 'hash improvement without removal must BLOCK');

dir = repo('new-command-with-downgrade');
write(path.join(dir, 'src', 'commands', 'new.js'), "'use strict';\n");
git(dir, ['rm', 'src/commands/existing.js']);
git(dir, ['add', 'src/commands/new.js']);
result = run(dir);
must(result.code === 0, 'removing a command must PASS');

dir = repo('strong-vocabulary');
write(path.join(dir, 'README.md'), '# Fixture\n\nThe cross-vendor capability control plane.\n');
git(dir, ['add', 'README.md']);
result = run(dir);
must(result.code === 2 && result.out.includes('strong-vocabulary'), 'strong vocabulary without claim must BLOCK');

console.log('change-gate selftest passed: no-claim=BLOCK, claim-only=BLOCK, hash-only=BLOCK, removal=PASS, strong-vocab=BLOCK');
