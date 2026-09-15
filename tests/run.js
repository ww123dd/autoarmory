'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'bin', 'selfforge.js');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'selfforge-'));

function run(args, cwd) {
  const result = spawnSync(process.execPath, [cli].concat(args), { cwd: cwd || root, encoding: 'utf8' });
  return { code: result.status, out: result.stdout || '', err: result.stderr || '' };
}
function must(condition, message) {
  if (!condition) { console.error('FAIL: ' + message); process.exit(1); }
}
function firstJsonl(file) {
  const lines = fs.readFileSync(file, 'utf8').trim().split(String.fromCharCode(10)).filter(Boolean);
  return JSON.parse(lines[0]);
}

let result = run(['version']);
must(result.code === 0 && result.out.trim() === '0.2.0', 'version');

const stateDir = path.join(temp, 'project');
fs.mkdirSync(stateDir, { recursive: true });
result = run(['init', stateDir]);
must(result.code === 0 && fs.existsSync(path.join(stateDir, '.selfforge', 'config.json')), 'init');

const incidentsFile = path.join(temp, 'incidents.jsonl');
result = run(['observe', path.join(root, 'examples', 'incidents.jsonl'), '--output', incidentsFile]);
must(result.code === 0 && fs.existsSync(incidentsFile), 'observe');
const incidents = fs.readFileSync(incidentsFile, 'utf8');
must(incidents.includes('test_failure') && incidents.includes('security_finding') && incidents.includes('dead_reference'), 'observe should preserve distinct failure modes');

const candidatesFile = path.join(temp, 'candidates.jsonl');
result = run(['propose', incidentsFile, '--output', candidatesFile]);
must(result.code === 0 && fs.existsSync(candidatesFile), 'propose');
const proposedCandidate = firstJsonl(candidatesFile);
must(proposedCandidate.change && proposedCandidate.change.budget && proposedCandidate.change.reason, 'propose must emit a gate-ready change contract');
const candidate = firstJsonl(candidatesFile);
const candidateFile = path.join(temp, 'candidate.json');
fs.writeFileSync(candidateFile, JSON.stringify(candidate, null, 2), 'utf8');

result = run(['gate', candidateFile, '--json']);
must(result.code === 1 && /"ok": false/.test(result.out), 'gate must reject a candidate without a SkillCanary change contract');

result = run(['learn', path.join(root, 'examples', 'decisions.jsonl'), '--json']);
must(result.code === 0 && /add_guard/.test(result.out), 'learn');

result = run(['doctor', stateDir, '--json']);
must(result.code === 0 && /selfforge\/doctor\/v1/.test(result.out), 'doctor');

result = run(['environment', stateDir, '--write']);
must(result.code === 0 && fs.existsSync(path.join(stateDir, '.selfforge', 'environment.json')), 'environment fingerprint');

result = run(['policy', path.join(root, 'examples', 'decisions.jsonl'), '--json']);
must(result.code === 0 && /selfforge\/policy\/v1/.test(result.out), 'policy recommendation');

result = run(['acquire', candidatesFile, '--json']);
must(result.code === 0 && /acquisition_score/.test(result.out), 'candidate acquisition');

result = run(['experiment', 'compare', path.join(root, 'examples', 'experiment-before.json'), path.join(root, 'examples', 'experiment-after.json'), '--json']);
must(result.code === 0 && /improved/.test(result.out), 'experiment comparison');

result = run(['experiment', 'shadow', candidateFile, '--json']);
must(result.code === 0 && /shadow/.test(result.out), 'shadow plan');

result = run(['observe', path.join(root, 'examples', 'junit.xml'), '--format', 'junit', '--json']);
must(result.code === 0 && /gate-rejects-invalid/.test(result.out), 'JUnit observation');

result = run(['observe', path.join(root, 'examples', 'github-issues.json'), '--format', 'github', '--json']);
must(result.code === 0 && /adapter cannot parse JUnit failure/.test(result.out), 'GitHub issue observation');

result = run(['record', '--candidate', candidate.id, '--action', candidate.action, '--reward', '1.5', '--verified', 'true', '--state', path.join(stateDir, '.selfforge')]);
must(result.code === 0 && fs.existsSync(path.join(stateDir, '.selfforge', 'decisions.jsonl')), 'record decision');

result = run(['evolve', path.join(root, 'examples', 'incidents.jsonl'), '--state', path.join(temp, 'evolve-default-state'), '--json']);
must(result.code === 1 && /selfforge\/evolution\/v1/.test(result.out), 'evolve must reject candidates that do not pass the real gate');

// --- SkillCanary gate conformance (protocol-level, deterministic) ---

const fakeSkillCanary = path.join(temp, 'fake-skillcanary');
fs.mkdirSync(path.join(fakeSkillCanary, 'bin'), { recursive: true });
fs.writeFileSync(path.join(fakeSkillCanary, 'bin', 'skillcanary.js'), [
  "'use strict';",
  "const fs = require('fs');",
  "const args = process.argv.slice(2);",
  "if (args[0] === 'version') { process.stdout.write('0.9.0'); process.exit(0); }",
  "if (args[0] !== 'gate') { process.stderr.write('unexpected command: ' + args[0]); process.exit(2); }",
  "const change = JSON.parse(fs.readFileSync(args[1], 'utf8'));",
  "const errors = [];",
  "if (!change.reason || change.reason.length < 20) errors.push('reason too short');",
  "if (!change.budget || change.budget.repeat < 3) errors.push('budget repeat too low');",
  "process.stdout.write(JSON.stringify({ errors: errors, warnings: [] }, null, 2));",
  "process.exit(errors.length ? 1 : 0);"
].join(String.fromCharCode(10)), 'utf8');

function gateCandidate(id, reason) {
  return {
    schema_version: 'selfforge/candidate/v1',
    id: id,
    incident_id: 'inc-' + id,
    action: 'fix_reference',
    target: { kind: 'deterministic', id: 'dead-pointer-check', check: 'selfcheck' },
    expected_transition: 'COUNT->0',
    prediction: { fix: ['dead-pointer-check'], regress_risk: ['lint'] },
    evidence: ['observed dead pointer'],
    risk: 'low',
    status: 'candidate',
    change: {
      skill: 'example-skill',
      reason: reason,
      decision: 'Verify the deterministic selfcheck count drops to zero without a new regression.',
      production_change: false,
      budget: { repeat: 3, max_runs: 9 },
      evidence: { kind: 'deterministic', check: 'selfcheck', count_before: 2, count_after: 0, evidence: 'selfcheck: 2 -> 0' }
    }
  };
}

const nullGateFile = path.join(temp, 'null-gate-candidate.json');
fs.writeFileSync(nullGateFile, 'null', 'utf8');
result = run(['gate', nullGateFile, '--skillcanary', fakeSkillCanary, '--json']);
must(result.code === 1 && result.out.includes('schema_version must be selfforge/candidate/v1'), 'gate must reject null candidates without crashing');
const validGateFile = path.join(temp, 'valid-gate-candidate.json');
fs.writeFileSync(validGateFile, JSON.stringify(gateCandidate('cand-valid-gate', 'The deterministic selfcheck found a dead reference that must be removed.'), null, 2), 'utf8');
result = run(['gate', validGateFile, '--skillcanary', fakeSkillCanary, '--json']);
must(result.code === 0 && result.out.includes('"command": "gate"') && result.out.includes('"ok": true'), 'gate should proxy to SkillCanary gate');

const invalidGateFile = path.join(temp, 'invalid-gate-candidate.json');
fs.writeFileSync(invalidGateFile, JSON.stringify(gateCandidate('cand-invalid-gate', 'short'), null, 2), 'utf8');
result = run(['gate', invalidGateFile, '--skillcanary', fakeSkillCanary, '--json']);
must(result.code === 1 && result.out.includes('reason too short') && result.out.includes('"ok": false'), 'SkillCanary gate errors must reject the candidate');

const missingSkillCanary = path.join(temp, 'missing-skillcanary');
result = run(['gate', validGateFile, '--skillcanary', missingSkillCanary, '--json']);
must(result.code === 1 && /SkillCanary CLI not found/.test(result.out + result.err), 'missing SkillCanary must fail closed');

const evolveState = path.join(temp, 'evolve-state');
result = run(['evolve', path.join(root, 'examples', 'incidents.jsonl'), '--state', evolveState, '--skillcanary', missingSkillCanary, '--json']);
const evolveOutput = JSON.parse(result.out);
must(result.code === 1 && evolveOutput.rejected === evolveOutput.candidates && evolveOutput.gated === 0, 'evolve must not mark candidates gated when SkillCanary is unavailable');

console.log('SelfForge tests passed');
