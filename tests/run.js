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
const candidate = firstJsonl(candidatesFile);
const candidateFile = path.join(temp, 'candidate.json');
fs.writeFileSync(candidateFile, JSON.stringify(candidate, null, 2), 'utf8');

result = run(['gate', candidateFile, '--json']);
must(result.code === 0 && /"ok": true/.test(result.out), 'gate');

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

result = run(['evolve', path.join(root, 'examples', 'incidents.jsonl'), '--json']);
must(result.code === 0 && /selfforge\/evolution\/v1/.test(result.out), 'evolve orchestration');

console.log('SelfForge tests passed');
