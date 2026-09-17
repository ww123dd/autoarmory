'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const http = require('http');

const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'bin', 'skillcanary.js');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'skillcanary-'));

function run(args, env) {
  const r = spawnSync(process.execPath, [cli].concat(args), { encoding: 'utf8', env: Object.assign({}, process.env, env || {}) });
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' };
}

function must(cond, message) {
  if (!cond) {
    console.error('FAIL: ' + message);
    process.exit(1);
  }
}

const stats = require('../src/lib/stats');
for (const alpha of [0.01, 0.1, 0.3, 0.34, 1, 2]) {
  const value = stats.sampleBeta(alpha, 1, stats.makeRng(7));
  must(Number.isFinite(value) && value >= 0 && value <= 1, 'sampleBeta boundary must be finite and in range');
}

function copyExample() {
  const dst = path.join(temp, 'skill-' + Math.random().toString(16).slice(2));
  fs.cpSync(path.join(root, 'examples', 'basic-skill'), dst, { recursive: true });
  return dst;
}

let r = run(['lint', path.join(root, 'examples', 'basic-skill')]);
must(r.code === 0, 'lint example should pass\n' + r.out + r.err);

const noBoundary = copyExample();
const noBoundaryFile = path.join(noBoundary, 'SKILL.md');
fs.writeFileSync(noBoundaryFile, fs.readFileSync(noBoundaryFile, 'utf8').replace(/ Do not use it for production skills or domain workflows\./, ''));
r = run(['lint', noBoundary]);
must(r.code === 1 && /trigger contract:.*when_not_to_use/.test(r.out + r.err), 'lint must reject a description without when_not_to_use\n' + r.out + r.err);

const invalid = copyExample();
const skillFile = path.join(invalid, 'SKILL.md');
fs.writeFileSync(skillFile, fs.readFileSync(skillFile, 'utf8').replace('name: basic-skill', 'name: Basic_Skill'));
r = run(['lint', invalid, '--strict']);
must(r.code === 1, 'lint invalid name should fail\n' + r.out + r.err);

r = run(['gate', path.join(root, 'examples', 'change.good.json'), path.join(root, 'examples', 'cases.json')]);
must(r.code === 0, 'good gate should pass\n' + r.out + r.err);
r = run(['gate', path.join(root, 'examples', 'change.deterministic.json')]);
must(r.code === 0, 'deterministic gate should pass\n' + r.out + r.err);
const badDet = JSON.parse(fs.readFileSync(path.join(root, 'examples', 'change.deterministic.json'), 'utf8'));
badDet.evidence.count_after = badDet.evidence.count_before;
const badDetFile = path.join(temp, 'bad-deterministic.json');
fs.writeFileSync(badDetFile, JSON.stringify(badDet));
r = run(['gate', badDetFile]);
must(r.code === 1, 'non-decreasing deterministic evidence must fail\n' + r.out + r.err);

r = run(['gate', path.join(root, 'examples', 'change.bad.json'), path.join(root, 'examples', 'cases.json')]);
must(r.code === 1, 'bad gate should fail\n' + r.out + r.err);

const anchorDir = copyExample();
r = run(['anchor', anchorDir]);
must(r.code === 0 && fs.existsSync(path.join(anchorDir, 'skillcanary.lock.json')), 'anchor should create lock\n' + r.out + r.err);
r = run(['anchor', anchorDir, '--check']);
must(r.code === 0, 'anchor check should be in sync\n' + r.out + r.err);
fs.appendFileSync(path.join(anchorDir, 'references', 'guide.md'), '\nchanged\n');
r = run(['anchor', anchorDir, '--check']);
must(r.code === 1, 'anchor check should detect drift\n' + r.out + r.err);

r = run(['mcp-onboard', path.join(root, 'examples', 'mcp', 'good.json')]);
must(r.code === 0, 'good mcp record should pass\n' + r.out + r.err);
r = run(['mcp-onboard', path.join(root, 'examples', 'mcp', 'bad.json')]);
must(r.code === 1, 'bad mcp record should fail\n' + r.out + r.err);

const initDir = path.join(temp, 'init-dir');
fs.mkdirSync(initDir, { recursive: true });
r = run(['init', initDir]);
must(r.code === 0 && fs.existsSync(path.join(initDir, '.skillcanary', 'change.example.json')), 'init should create examples\n' + r.out + r.err);

function runHook(args, cwd, input) {
  const r = spawnSync(process.execPath, [cli].concat(args), { cwd: cwd, input: input, encoding: 'utf8' });
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' };
}

const reportFile = path.join(temp, 'report.md');
r = run(['report', path.join(root, 'examples', 'basic-skill'), '--output', reportFile]);
must(r.code === 0 && fs.existsSync(reportFile), 'report should pass\n' + r.out + r.err);

const eventFile = path.join(temp, 'event.json');
fs.writeFileSync(eventFile, JSON.stringify({ repository: { full_name: 'example/skillcanary' }, pull_request: { number: 1 } }));
r = run(['comment', '--file', reportFile, '--dry-run'], { GITHUB_EVENT_PATH: eventFile });
must(r.code === 0 && r.out.indexOf('example/skillcanary') !== -1, 'comment dry-run should work\n' + r.out + r.err);

const actionDir = path.join(temp, 'action-dir');
fs.mkdirSync(actionDir, { recursive: true });
r = run(['init', actionDir, '--with-action']);
must(r.code === 0 && fs.existsSync(path.join(actionDir, '.github', 'workflows', 'skillcanary.yml')), 'init --with-action should create workflow\n' + r.out + r.err);

const skillgradeFile = path.join(temp, 'skillgrade.json');
fs.writeFileSync(skillgradeFile, JSON.stringify({ before: { pass: 0, total: 3 }, after: { pass: 3, total: 3 } }));
const skillgradeChange = path.join(temp, 'skillgrade-change.json');
r = run(['import', 'skillgrade', skillgradeFile, '--output', skillgradeChange]);
must(r.code === 0 && fs.existsSync(skillgradeChange), 'skillgrade import should work\n' + r.out + r.err);
r = run(['gate', skillgradeChange, path.join(root, 'examples', 'cases.json')]);
must(r.code === 0, 'imported skillgrade change should pass gate\n' + r.out + r.err);

const aseFile = path.join(temp, 'agent-skills-eval.json');
fs.writeFileSync(aseFile, JSON.stringify({ evals: [{ id: 'c01', without_skill: { pass: 0, total: 3 }, with_skill: { pass: 3, total: 3 } }] }));
const aseChange = path.join(temp, 'agent-skills-eval-change.json');
r = run(['import', 'agent-skills-eval', aseFile, '--case', 'c01', '--output', aseChange]);
must(r.code === 0 && fs.existsSync(aseChange), 'agent-skills-eval import should work\n' + r.out + r.err);

const promptfooFile = path.join(temp, 'promptfoo.json');
fs.writeFileSync(promptfooFile, JSON.stringify({ results: { stats: { successes: 3, failures: 0 } } }));
const promptfooChange = path.join(temp, 'promptfoo-change.json');
r = run(['import', 'promptfoo', promptfooFile, '--output', promptfooChange]);
must(r.code === 0 && fs.existsSync(promptfooChange), 'promptfoo import should work\n' + r.out + r.err);
const autoSkillgradeFile = path.join(temp, 'auto-skillgrade.json');
fs.writeFileSync(autoSkillgradeFile, JSON.stringify({ summary: { before: { passed: 0, total: 3 }, after: { passed: 3, total: 3 } } }));
const autoSkillgradeChange = path.join(temp, 'auto-skillgrade-change.json');
r = run(['import', 'auto', autoSkillgradeFile, '--output', autoSkillgradeChange]);
must(r.code === 0 && fs.existsSync(autoSkillgradeChange), 'auto skillgrade import should work\n' + r.out + r.err);
const autoChange = JSON.parse(fs.readFileSync(autoSkillgradeChange, 'utf8'));
must(autoChange.target && autoChange.target.kind === 'case' && autoChange.target.id === 'c01', 'import should emit a modern target object');

const hookDir = path.join(temp, 'hook-dir');
fs.mkdirSync(path.join(hookDir, '.skillcanary'), { recursive: true });
fs.writeFileSync(path.join(hookDir, '.skillcanary', 'hook-rules.json'), JSON.stringify({ preTool: [{ id: 'block-me', pattern: 'BLOCK_ME', reason: 'test rule' }] }));
r = runHook(['hook', 'pre-tool'], hookDir, JSON.stringify({ command: 'BLOCK_ME' }));
must(r.code === 0 && r.out.indexOf('"deny"') !== -1, 'hook pre-tool should deny\n' + r.out + r.err);
r = runHook(['hook', 'pre-tool'], hookDir, JSON.stringify({ command: 'allowed' }));
must(r.code === 0 && r.out.indexOf('"allow"') !== -1, 'hook pre-tool should allow\n' + r.out + r.err);
r = runHook(['hook', 'session-end'], hookDir, JSON.stringify({ session_id: 's1', skill: 'demo', skill_hash: 'abc', signals: { completed: true } }));
must(r.code === 0 && fs.existsSync(path.join(hookDir, '.skillcanary', 'outcomes.jsonl')), 'hook session-end should write outcome\n' + r.out + r.err);
r = runHook(['hook', 'doctor'], hookDir, '');
must(r.code === 0 && /PASS/.test(r.out), 'hook doctor should pass a valid rule file\n' + r.out + r.err);
const badHookDir = path.join(temp, 'bad-hook-dir');
fs.mkdirSync(path.join(badHookDir, '.skillcanary'), { recursive: true });
fs.writeFileSync(path.join(badHookDir, '.skillcanary', 'hook-rules.json'), JSON.stringify({ preTool: [{ id: 'broken', pattern: '[' }] }));
r = runHook(['hook', 'doctor'], badHookDir, '');
must(r.code === 1 && /invalid/.test(r.out), 'hook doctor should reject an invalid regex\n' + r.out + r.err);

const releaseCommand = require('../src/commands/release');
must(releaseCommand.scanLeaks(root).length === 0, 'release privacy scan should not find private markers in the public tree');

const sessionFile = path.join(temp, 'session.json');
fs.writeFileSync(sessionFile, JSON.stringify({ messages: [{ role: 'user', content: '这个不对，重来' }] }));
const adviceFile = path.join(temp, 'advice.jsonl');
r = run(['scan', '--skill', 'demo', '--sessions', sessionFile, '--output', adviceFile]);
must(r.code === 0 && fs.existsSync(adviceFile), 'scan should produce advice\n' + r.out + r.err);
r = run(['advice', adviceFile]);
must(r.code === 0, 'advice listing should work\n' + r.out + r.err);
const adviceId = JSON.parse(fs.readFileSync(adviceFile, 'utf8').trim().split(/\r?\n/)[0]).id;
r = run(['promote', adviceFile, '--id', adviceId]);
must(r.code === 1, 'low-frequency advice must not promote\n' + r.out + r.err);
const outcomeFile = path.join(temp, 'outcomes.jsonl');
r = run(['track', '--session', 's1', '--skill', 'demo', '--hash', 'abc', '--output', outcomeFile]);
must(r.code === 0 && fs.existsSync(outcomeFile), 'track should write an outcome\n' + r.out + r.err);

const decisionLog = path.join(temp, 'decisions.jsonl');
r = run(['policy', 'record', path.join(root, 'examples', 'decision.example.json'), '--log', decisionLog]);
must(r.code === 0 && fs.existsSync(decisionLog), 'policy record should work\n' + r.out + r.err);
r = run(['policy', 'stats', '--log', decisionLog]);
must(r.code === 0 && r.out.indexOf('add_rule') !== -1, 'policy stats should work\n' + r.out + r.err);
r = run(['policy', 'recommend', '--failure-mode', 'missing-schema-check', '--log', decisionLog]);
must(r.code === 0 && r.out.indexOf('add_rule') !== -1, 'policy recommend should work\n' + r.out + r.err);
r = run(['policy', 'pareto', '--log', decisionLog, '--json']);
must(r.code === 0 && r.out.indexOf('add_rule') !== -1, 'policy pareto should work\n' + r.out + r.err);
r = run(['policy', 'simulate', '--horizon', '20', '--seed', '3', '--json']);
must(r.code === 0 && /thompson/.test(r.out), 'policy simulation should compare algorithms\n' + r.out + r.err);
r = run(['trajectory', 'analyze', path.join(root, 'examples', 'trace', 'agent-trace.json'), '--json']);
must(r.code === 0 && /skillcanary\/metrics\/v1/.test(r.out), 'trajectory analysis should work\n' + r.out + r.err);
r = run(['reliability', 'estimate', path.join(root, 'examples', 'reliability', 'trials.jsonl'), '--k', '3']);
must(r.code === 0 && /pass_power_k/.test(r.out), 'reliability estimate should work\n' + r.out + r.err);
r = run(['reliability', 'compare', path.join(root, 'examples', 'reliability', 'before.jsonl'), path.join(root, 'examples', 'reliability', 'after.jsonl')]);
must(r.code === 0 && /verdict/.test(r.out), 'reliability compare should work\n' + r.out + r.err);
r = run(['grader', 'calibrate', path.join(root, 'examples', 'grader', 'pairs.json'), '--json']);
must(r.code === 0 && /trusted/.test(r.out), 'grader calibration should work\n' + r.out + r.err);
r = run(['grader', 'plan', path.join(root, 'examples', 'grader', 'step-open.json'), '--json']);
must(r.code === 0 && /llm_ensemble/.test(r.out), 'grader plan should choose calibrated LLM judging\n' + r.out + r.err);
r = run(['execution', 'audit', path.join(root, 'examples', 'execution', 'workflow.json')]);
must(r.code === 1 && /REVIEW/.test(r.out), 'execution audit should reject agent overuse\n' + r.out + r.err);
const goldenOutput = path.join(temp, 'golden.json');
r = run(['golden', 'curate', path.join(root, 'examples', 'golden', 'candidates.jsonl'), '--output', goldenOutput]);
must(r.code === 0 && fs.existsSync(goldenOutput), 'golden curation should work\n' + r.out + r.err);



const provDir = path.join(temp, 'prov');
fs.mkdirSync(path.join(provDir, 'evidence'), { recursive: true });
fs.copyFileSync(path.join(root, 'examples', 'change.provenance.json'), path.join(provDir, 'change.json'));
fs.copyFileSync(path.join(root, 'examples', 'evidence', 'run-001.json'), path.join(provDir, 'evidence', 'run-001.json'));
r = run(['gate', path.join(provDir, 'change.json'), '--require-provenance']);
must(r.code === 0, 'provenance gate should pass\n' + r.out + r.err);
fs.appendFileSync(path.join(provDir, 'evidence', 'run-001.json'), '\ntampered\n');
r = run(['gate', path.join(provDir, 'change.json'), '--require-provenance']);
must(r.code === 1 && /hash mismatch/.test(r.out), 'tampered evidence should fail provenance\n' + r.out + r.err);

const rawEvidence = path.join(temp, 'raw-evidence.json');
fs.writeFileSync(rawEvidence, JSON.stringify({ skill: 'demo', skill_hash: 'abc', check: 'selfcheck', count_before: 2, count_after: 0, verification: { verified_by: 'oracle', oracle: 'selfcheck', result: 'pass' } }));
const normalizedEvidence = path.join(temp, 'evidence.json');
r = run(['evidence', 'normalize', rawEvidence, '--output', normalizedEvidence]);
must(r.code === 0 && fs.existsSync(normalizedEvidence), 'evidence normalize should work\n' + r.out + r.err);
const evidenceLog = path.join(temp, 'evidence.jsonl');
r = run(['evidence', 'record', normalizedEvidence, '--log', evidenceLog]);
must(r.code === 0 && fs.existsSync(evidenceLog), 'evidence record should work\n' + r.out + r.err);
r = run(['evidence', 'stats', '--log', evidenceLog]);
must(r.code === 0 && r.out.indexOf('deterministic') !== -1, 'evidence stats should work\n' + r.out + r.err);
const storeDir = path.join(temp, 'store');
r = run(['store', 'index', '--input', evidenceLog, '--dir', storeDir]);
must(r.code === 0 && fs.existsSync(path.join(storeDir, 'eval-case-scores.jsonl')), 'store index should work\n' + r.out + r.err);
r = run(['store', 'query', '--dir', storeDir, '--case', 'unknown', '--json']);
must(r.code === 0 && r.out.indexOf('COUNT->0') !== -1, 'store query should retrieve deterministic transition\n' + r.out + r.err);
const storeSql = path.join(temp, 'store.sql');
r = run(['store', 'export-sql', '--dir', storeDir, '--output', storeSql]);
must(r.code === 0 && fs.existsSync(storeSql) && /CREATE TABLE IF NOT EXISTS eval_run/.test(fs.readFileSync(storeSql, 'utf8')), 'store export-sql should work\n' + r.out + r.err);
const securityFile = path.join(temp, 'security.json');
fs.writeFileSync(securityFile, JSON.stringify({ scanner: 'example-scanner', skill: 'demo', findings: [{ id: 'f1', severity: 'high', rule: 'prompt-injection', message: 'test finding', path: 'SKILL.md' }] }));
r = run(['adapter', 'detect', securityFile, '--json']);
must(r.code === 0 && /security/.test(r.out), 'adapter detect should identify security artifacts\n' + r.out + r.err);
r = run(['adapter', 'import', 'security', securityFile, '--json']);
must(r.code === 0 && /skillcanary\/risk\/v1/.test(r.out), 'adapter import should normalize security artifacts\n' + r.out + r.err);
const sarifFile = path.join(temp, 'security.sarif.json');
r = run(['adapter', 'export', securityFile, '--format', 'sarif', '--output', sarifFile]);
must(r.code === 0 && /sarif/.test(fs.readFileSync(sarifFile, 'utf8')), 'adapter export should produce SARIF\n' + r.out + r.err);
r = run(['adapter', 'doctor']);
must(r.code === 0 && /PASS/.test(r.out), 'adapter doctor should pass\n' + r.out + r.err);

const activeInput = path.join(temp, 'active.jsonl');
fs.writeFileSync(activeInput, JSON.stringify({ id: 'adv-1', severity: 'critical', determinism: 'deterministic', frequency: 2, assertion: 'observable' }) + '\n');
const activeOutput = path.join(temp, 'active-ranking.json');
r = run(['active', 'rank', activeInput, '--output', activeOutput]);
must(r.code === 0 && fs.existsSync(activeOutput), 'active ranking should work\n' + r.out + r.err);

const driftInput = path.join(temp, 'drift.jsonl');
const driftRows = [];
for (let i = 0; i < 12; i++) driftRows.push(JSON.stringify({ session_id: 's' + i, skill: 'demo', skill_hash: 'abc', observed_at: new Date().toISOString(), signals: { user_correction_count: i < 4 ? 0 : 4, rework_turns: 0, tool_error_count: 0, completed: false } }));
fs.writeFileSync(driftInput, driftRows.join('\n') + '\n');
r = run(['drift', 'check', driftInput, '--window', '12', '--threshold', '2']);
must(r.code === 1 && /x demo/.test(r.out), 'drift check should detect a change point\n' + r.out + r.err);


const budgetWithin = path.join(temp, 'budget-within.jsonl');
fs.writeFileSync(budgetWithin, JSON.stringify({ session_id: 's1', skill: 'demo', skill_hash: 'abc', observed_at: new Date().toISOString(), signals: { user_correction_count: 1, rework_turns: 1, tool_error_count: 1, completed: true } }) + '\n');
r = run(['budget', 'check', '--input', budgetWithin]);
must(r.code === 0, 'budget within limits should pass\n' + r.out + r.err);
const budgetOver = path.join(temp, 'budget-over.jsonl');
fs.writeFileSync(budgetOver, JSON.stringify({ session_id: 's2', skill: 'demo', skill_hash: 'abc', observed_at: new Date().toISOString(), signals: { user_correction_count: 9, rework_turns: 9, tool_error_count: 9, completed: false } }) + '\n');
r = run(['budget', 'check', '--input', budgetOver]);
must(r.code === 1 && /STOP_AND_COLLECT_INCIDENTS/.test(r.out), 'budget over limits should stop changes\n' + r.out + r.err);
const rawSessions = path.join(temp, 'raw-sessions.json');
fs.writeFileSync(rawSessions, JSON.stringify({ sessions: [{ id: 's3', skill: 'demo', skill_hash: 'abc', messages: [{ role: 'user', content: '这个不对，重新做' }, { role: 'tool_error', content: 'failed' }] }] }));
const ingestedOutcomes = path.join(temp, 'ingested-outcomes.jsonl');
r = run(['budget', 'ingest', rawSessions, '--output', ingestedOutcomes]);
must(r.code === 0 && fs.existsSync(ingestedOutcomes), 'budget ingest should normalize sessions\n' + r.out + r.err);
const ingested = JSON.parse(fs.readFileSync(ingestedOutcomes, 'utf8').trim());
must(ingested.signals.user_correction_count === 1 && ingested.signals.tool_error_count === 1, 'budget ingest should derive signals');

r = run(['doctor', path.join(root, 'examples', 'basic-skill'), '--json']);
must(r.code === 0 && /skillcanary\/doctor\/v1/.test(r.out), 'doctor should produce a structured report\n' + r.out + r.err);

r = run(['version']);
must(r.code === 0 && r.out.trim() === '0.9.1', 'version should work\n' + r.out + r.err);

async function testMockComment() {
  const requests = [];
  const server = http.createServer(function (req, res) {
    requests.push(req.method + ' ' + req.url);
    if (req.method === 'GET' && req.url === '/repos/example/skillcanary/issues/1/comments?per_page=100') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('[]');
      return;
    }
    if (req.method === 'POST' && req.url === '/repos/example/skillcanary/issues/1/comments') {
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end('{"id":1}');
      return;
    }
    if (req.method === 'PATCH' && req.url === '/repos/example/skillcanary/issues/comments/1') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"id":1}');
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end('{}');
  });
  await new Promise(function (resolve) { server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  try {
    const child = spawn(process.execPath, [cli, 'comment', '--file', reportFile], {
      env: Object.assign({}, process.env, {
        GITHUB_API_URL: 'http://127.0.0.1:' + port,
        GITHUB_TOKEN: 'test',
        GITHUB_EVENT_PATH: eventFile
      })
    });
    let out = '';
    let err = '';
    child.stdout.on('data', function (d) { out += d; });
    child.stderr.on('data', function (d) { err += d; });
    const code = await new Promise(function (resolve) { child.on('close', resolve); });
    must(code === 0, 'mock PR comment should succeed\n' + out + err);
    must(requests.indexOf('GET /repos/example/skillcanary/issues/1/comments?per_page=100') !== -1, 'mock GET missing');
    must(requests.indexOf('POST /repos/example/skillcanary/issues/1/comments') !== -1, 'mock POST missing');
  } finally {
    await new Promise(function (resolve) { server.close(resolve); });
  }
}

testMockComment().then(function () {
  console.log('SkillCanary tests passed');
}).catch(function (err) {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
