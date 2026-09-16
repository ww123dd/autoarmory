'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'bin', 'autoarmory.js');
const legacyCli = path.join(root, 'bin', 'selfforge.js');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-'));

function run(args, cwd, input) {
  const result = spawnSync(process.execPath, [cli].concat(args), { cwd: cwd || root, encoding: 'utf8', input: input });
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
must(result.code === 0 && result.out.trim() === '1.3.0', 'version');
must(pkg.name === 'autoarmory' && pkg.bin.autoarmory === 'bin/autoarmory.js' && pkg.bin.selfforge === 'bin/selfforge.js', 'AutoArmory package and legacy aliases');
const legacyVersion = spawnSync(process.execPath, [legacyCli, 'version'], { cwd: root, encoding: 'utf8' });
must(legacyVersion.status === 0 && legacyVersion.stdout.trim() === pkg.version, 'legacy selfforge CLI alias');
result = run(['--help']);
must(result.code === 0 && /AutoArmory/.test(result.out), 'help must use AutoArmory brand');

const readmeText = fs.readFileSync(path.join(root, 'README.md'), 'utf8').toLowerCase();
must(!readmeText.includes('cross-vendor') && !readmeText.includes('capability control plane'), 'README must use local capability manager positioning');
must(!readmeText.includes('weapon') && !readmeText.includes('loadout'), 'README must not use the weapon metaphor');
must(!/\bserve\b/i.test(result.out), 'serve must not be advertised in the public CLI');
const description = String(pkg.description || '').toLowerCase();
must(description.includes('local capability manager') && !description.includes('control plane'), 'package description must use local capability manager positioning');

const vendoredSkillCanaryCli = path.join(root, 'packages', 'skillcanary', 'bin', 'skillcanary.js');
must(fs.existsSync(vendoredSkillCanaryCli), 'vendored SkillCanary package');
result = run(['canary', 'version']);
must(result.code === 0 && result.out.trim() === '0.9.0', 'canary version command');
result = run(['canary', 'adapter', 'doctor', '--json']);
must(result.code === 0 && /"ok": true/.test(result.out), 'canary adapter doctor command');
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
const environmentData = JSON.parse(fs.readFileSync(path.join(stateDir, '.selfforge', 'environment.json'), 'utf8'));
must(environmentData.git_commit === null, 'environment fingerprint must probe the requested directory');

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
result = run(['observe', '-', '--format', 'log', '--json'], root, 'FAIL: real runner failure');
must(result.code === 0 && /test_failure/.test(result.out), 'stdin runner log observation');

result = run(['observe', '-', '--format', 'junit', '--json'], root, fs.readFileSync(path.join(root, 'examples', 'junit.xml'), 'utf8'));
must(result.code === 0 && /gate-rejects-invalid/.test(result.out), 'stdin JUnit observation');

result = run(['observe', '-', '--format', 'github', '--json'], root, JSON.stringify([{ number: 202, title: 'adapter cannot parse stdin issue', url: 'https://example.invalid/issues/202' }]));
must(result.code === 0 && /adapter cannot parse stdin issue/.test(result.out) && /https:\/\/example.invalid\/issues\/202/.test(result.out), 'stdin GitHub issue observation');

const decisionsFile = path.join(stateDir, '.selfforge', 'decisions.jsonl');
result = run(['record', '--candidate', candidate.id, '--action', candidate.action, '--reward', '1.5', '--verified', 'true', '--state', path.join(stateDir, '.selfforge')]);
must(result.code === 1 && fs.readFileSync(decisionsFile, 'utf8').trim() === '', 'record must reject outcomes without a gate pass');

const gateProofFile = path.join(temp, 'gate-proof.json');
fs.writeFileSync(gateProofFile, JSON.stringify({
  schema_version: 'selfforge/gate/v1',
  ok: true,
  candidate_id: candidate.id,
  skillcanary: { schema_version: 'selfforge/skillcanary-gate/v1', ok: true, command: 'gate', version: '0.9.0', exit_code: 0, change_sha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }
}, null, 2), 'utf8');
result = run(['record', '--candidate', candidate.id, '--action', candidate.action, '--reward', '1.5', '--verified', 'true', '--gate', gateProofFile, '--state', path.join(stateDir, '.selfforge')]);
must(result.code === 1 && fs.readFileSync(decisionsFile, 'utf8').trim() === '', 'verified outcome must require outcome evidence');

const outcomeEvidenceFile = path.join(temp, 'outcome-evidence.json');
fs.writeFileSync(outcomeEvidenceFile, JSON.stringify({
  kind: 'deterministic',
  before: { count: 2 },
  after: { count: 0 },
  artifacts: [{ uri: 'evidence/run.json', sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }]
}, null, 2), 'utf8');
result = run(['record', '--candidate', candidate.id, '--action', candidate.action, '--reward', '1.5', '--verified', 'true', '--gate', gateProofFile, '--evidence', outcomeEvidenceFile, '--dir', stateDir, '--state', path.join(stateDir, '.selfforge')]);
must(result.code === 0 && fs.existsSync(decisionsFile), 'record decision with gate and evidence');
const decision = JSON.parse(fs.readFileSync(decisionsFile, 'utf8').trim().split(String.fromCharCode(10))[0]);
must(decision.environment && decision.environment.fingerprint && decision.gate && decision.gate.ok === true && decision.outcome_evidence && decision.outcome_evidence.kind === 'deterministic', 'decision must include environment, gate and outcome evidence');

const transitionState = path.join(stateDir, '.selfforge');
result = run(['transition', candidateFile, '--to', 'canary', '--gate', gateProofFile, '--state', transitionState, '--json']);
must(result.code === 1 && /invalid transition/i.test(result.out + result.err), 'state machine must reject candidate -> canary');

result = run(['transition', candidateFile, '--to', 'gated', '--state', transitionState, '--json']);
must(result.code === 1 && /invalid transition/i.test(result.out + result.err), 'candidate -> gated must pass through approval');

result = run(['transition', candidateFile, '--to', 'pending_approval', '--state', transitionState, '--json']);
must(result.code === 0 && JSON.parse(result.out).to === 'pending_approval', 'candidate -> pending_approval transition');

result = run(['transition', candidateFile, '--to', 'gated', '--gate', gateProofFile, '--state', transitionState, '--json']);
must(result.code === 1 && /approval/i.test(result.out + result.err), 'pending_approval -> gated must require user approval');

const approvalFile = path.join(temp, 'approval.json');
fs.writeFileSync(approvalFile, JSON.stringify({
  schema_version: 'selfforge/approval/v1',
  id: 'appr-transition',
  candidate_id: candidate.id,
  requested_by: 'agent',
  approved_by: 'user',
  approved_at: '2026-09-16T00:00:00.000Z',
  channel: 'conversation',
  scope: 'gated',
  status: 'approved'
}, null, 2), 'utf8');
result = run(['transition', candidateFile, '--to', 'gated', '--gate', gateProofFile, '--approval', approvalFile, '--state', transitionState, '--json']);
must(result.code === 0 && JSON.parse(result.out).to === 'gated' && JSON.parse(result.out).approval && JSON.parse(result.out).approval.approved_by === 'user', 'approved candidate -> gated transition');

result = run(['transition', candidateFile, '--to', 'shadow', '--gate', gateProofFile, '--state', transitionState, '--json']);
must(result.code === 0 && JSON.parse(result.out).to === 'shadow', 'gated -> shadow transition');

result = run(['transition', candidateFile, '--to', 'canary', '--state', transitionState, '--json']);
must(result.code === 1 && /outcome evidence/i.test(result.out + result.err), 'canary transition must require outcome evidence');

result = run(['transition', candidateFile, '--to', 'canary', '--evidence', outcomeEvidenceFile, '--state', transitionState, '--json']);
must(result.code === 0 && JSON.parse(result.out).to === 'canary', 'shadow -> canary transition');

result = run(['transition', candidateFile, '--to', 'promoted', '--state', transitionState, '--json']);
must(result.code === 1 && /outcome evidence/i.test(result.out + result.err), 'promoted transition must require outcome evidence');

result = run(['transition', candidateFile, '--to', 'promoted', '--evidence', outcomeEvidenceFile, '--state', transitionState, '--json']);
must(result.code === 0 && JSON.parse(result.out).to === 'promoted', 'canary -> promoted transition');
const transitions = fs.readFileSync(path.join(transitionState, 'transitions.jsonl'), 'utf8').trim().split(String.fromCharCode(10)).filter(Boolean);
must(transitions.length === 5 && transitions.every(function (line) { return JSON.parse(line).schema_version === 'selfforge/transition/v1'; }), 'state transitions must be recorded');
const rejectedCandidate = JSON.parse(JSON.stringify(candidate));
rejectedCandidate.id = 'cand-rejected-state';
rejectedCandidate.incident_id = 'inc-rejected-state';
const rejectedCandidateFile = path.join(temp, 'rejected-candidate.json');
fs.writeFileSync(rejectedCandidateFile, JSON.stringify(rejectedCandidate, null, 2), 'utf8');
result = run(['transition', rejectedCandidateFile, '--to', 'rejected', '--reason', 'Observed shadow regression is unacceptable.', '--state', transitionState, '--json']);
must(result.code === 0 && JSON.parse(result.out).to === 'rejected', 'candidate -> rejected transition with reason');
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

console.log('AutoArmory tests passed');
