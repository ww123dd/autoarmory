'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const COMMANDS = [
  { id: 'tests', command: 'node tests/run.js' },
  { id: 'approval_loop', command: 'node tests/approval-loop.js' },
  { id: 'capability', command: 'node tests/capability.js' },
  { id: 'failure_modes', command: 'node tests/failure-modes.js' },
  { id: 'demo', command: 'node tests/demo.js' },
  { id: 'bench', command: 'node tests/bench.js' },
  { id: 'integrate', command: 'node tests/integrate.js' },
  { id: 'admission', command: 'node tests/admission.js' },
  { id: 'scenario', command: 'node tests/scenario.js' },
  { id: 'api', command: 'node tests/api.js' },
  { id: 'aliases', command: 'node tests/aliases.js' },
  { id: 'skillcanary', command: 'node packages/skillcanary/tests/run.js' },
  { id: 'conformance', command: 'node tests/conformance.js' }
];

function execute(command, cwd) {
  const parts = command.split(' ');
  const result = spawnSync(parts[0], parts.slice(1), { cwd: cwd, encoding: 'utf8', timeout: 120000 });
  return { code: result.status, out: result.stdout || '', err: result.stderr || '' };
}

function checkCommand(item, cwd, runs) {
  let passes = 0;
  let last = null;
  for (let index = 0; index < runs; index++) {
    last = execute(item.command, cwd);
    if (last.code === 0) passes += 1;
  }
  return { id: item.id, command: item.command, runs: runs, passes: passes, failures: runs - passes, pass_k: passes === runs, ok: passes === runs, last_exit: last ? last.code : null };
}

function existsAll(base, files) {
  return files.every(function (file) { return fs.existsSync(path.join(base, file)); });
}

function runSelfEval(options) {
  const opts = options || {};
  const repo = path.resolve(opts.repo || '.');
  const runs = Math.max(1, Number(opts.runs || 3));
  const checks = [];
  for (const item of COMMANDS) checks.push(checkCommand(item, repo, runs));
  const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
  checks.push({ id: 'package', ok: pkg.name === 'autoarmory' && pkg.version === '2.11.0' && !!pkg.bin.autoarmory, detail: pkg.name + '@' + pkg.version });
  checks.push({ id: 'monorepo', ok: fs.existsSync(path.join(repo, 'packages', 'skillcanary', 'bin', 'skillcanary.js')), detail: 'vendored SkillCanary package' });
  const fixtureCount = fs.existsSync(path.join(repo, 'examples', 'capabilities.jsonl')) ? fs.readFileSync(path.join(repo, 'examples', 'capabilities.jsonl'), 'utf8').trim().split(/\r?\n/).filter(Boolean).length : 0;
  checks.push({ id: 'capability_fixtures', ok: fixtureCount === 4, detail: 'capability fixtures=' + fixtureCount });
  const docs = ['README.md', 'docs/failure-modes.md', 'docs/standards/agent-evaluation-standards.md', 'docs/learning/20260915-external-learning-summary.md'];
  checks.push({ id: 'docs', ok: existsAll(repo, docs), detail: docs.join(', ') });
  let worktree = { code: 0, out: '' };
  try { const result = spawnSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' }); worktree = { code: result.status, out: result.stdout || '' }; } catch (_) { worktree = { code: 1, out: 'git unavailable' }; }
  checks.push({ id: 'worktree', ok: worktree.code === 0 && worktree.out.trim() === '', detail: worktree.out.trim() || 'clean' });

  const testChecks = checks.filter(function (item) { return item.pass_k !== undefined; });
  const passedTests = testChecks.filter(function (item) { return item.pass_k; }).length;
  const conformance = checks.find(function (item) { return item.id === 'conformance'; });
  const capabilityFixtures = checks.find(function (item) { return item.id === 'capability_fixtures'; });
  const docsCheck = checks.find(function (item) { return item.id === 'docs'; });
  const worktreeCheck = checks.find(function (item) { return item.id === 'worktree'; });
  const score = {
    test_pass_k: Math.round((passedTests / testChecks.length) * 35),
    conformance: conformance && conformance.pass_k ? 20 : 0,
    capability_contracts: capabilityFixtures && capabilityFixtures.ok ? 15 : 0,
    safety_negative_controls: testChecks.filter(function (item) { return ['tests', 'capability'].indexOf(item.id) !== -1 && item.pass_k; }).length * 5,
    docs: docsCheck && docsCheck.ok ? 10 : 0,
    repo_integrity: worktreeCheck && worktreeCheck.ok ? 10 : 0
  };
  score.total = Object.keys(score).reduce(function (sum, key) { return sum + score[key]; }, 0);
  const verdict = score.total >= 85 && passedTests === testChecks.length ? 'ready' : (score.total >= 70 ? 'conditional' : 'not_ready');
  return {
    schema_version: 'autoarmory/self-eval/v1', generated_at: new Date().toISOString(), repo: repo, runs: runs, checks: checks, score: score, verdict: verdict,
    independence: { independent: false, note: 'Self-evaluation executed by the same repository/agent. Deterministic checks reduce, but do not remove, self-assessment bias.' }
  };
}

module.exports = { runSelfEval, COMMANDS };
