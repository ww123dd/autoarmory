'use strict';

const fs = require('fs');
const path = require('path');
const { parseArgs, printJson } = require('../lib/util');
const report = require('./report');
const hook = require('./hook');
const budget = require('./budget');
const store = require('./store');
const adapter = require('./adapter');
const policy = require('../lib/policy');
const stats = require('../lib/stats');
const metrics = require('../lib/metrics');
const reliability = require('../lib/reliability');
const execution = require('../lib/execution');

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(function (line) { return JSON.parse(line); });
}

function add(checks, id, status, detail, next) {
  checks.push({ id, status, detail, next: next || '' });
}

function checkHook(checks, skillDir) {
  const result = hook.doctor(skillDir);
  if (result.errors.length) add(checks, 'hook-rules', 'fail', result.errors.join('; '), 'skillcanary hook doctor');
  else if (result.warnings.length) add(checks, 'hook-rules', 'warn', result.warnings.join('; '), 'Add .skillcanary/hook-rules.json when a guard is needed.');
  else add(checks, 'hook-rules', 'pass', result.rules + ' rule(s) validated', '');
}

function checkBudget(checks, skillDir) {
  const input = path.join(skillDir, '.skillcanary', 'outcomes.jsonl');
  if (!fs.existsSync(input)) {
    add(checks, 'error-budget', 'warn', 'no outcome history yet', 'skillcanary budget ingest sessions.json --output .skillcanary/outcomes.jsonl');
    return;
  }
  const configFile = path.join(skillDir, '.skillcanary', 'budget.json');
  const config = fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, 'utf8')) : budget.DEFAULT_BUDGET;
  const rows = budget.summarize(readJsonl(input), config);
  const over = rows.filter(function (row) { return row.state === 'over_budget'; });
  if (over.length) add(checks, 'error-budget', 'fail', over.map(function (row) { return row.skill + ': ' + row.violations.join(','); }).join('; '), 'Stop adding rules. Collect new incidents, then re-run budget check.');
  else add(checks, 'error-budget', 'pass', rows.length + ' skill/hash group(s) within budget', '');
}



function checkTrajectory(checks, skillDir) {
  const input = path.join(skillDir, '.skillcanary', 'trace.json');
  if (!fs.existsSync(input)) { add(checks, 'trajectory', 'warn', 'no trace snapshot configured', 'skillcanary trajectory analyze .skillcanary/trace.json'); return; }
  try {
    const result = metrics.computeMetrics(JSON.parse(fs.readFileSync(input, 'utf8')));
    if (!result.pass) add(checks, 'trajectory', 'fail', 'six-dimensional trajectory metrics failed', 'Inspect tool selection, parameters, recovery, plan and completion.');
    else add(checks, 'trajectory', 'pass', 'trajectory metrics passed', '');
  } catch (err) { add(checks, 'trajectory', 'fail', err.message, 'Fix the trace artifact before analysis.'); }
}

function checkReliability(checks, skillDir) {
  const input = path.join(skillDir, '.skillcanary', 'trials.jsonl');
  if (!fs.existsSync(input)) { add(checks, 'reliability', 'warn', 'no trial history configured', 'skillcanary reliability estimate .skillcanary/trials.jsonl --k 4'); return; }
  try {
    const result = reliability.reliabilityFromTrials(readJsonl(input), 4);
    if (result.pass_power_k < 0.9) add(checks, 'reliability', 'fail', 'pass^4=' + result.pass_power_k, 'Do not promote until reliability is stable.');
    else add(checks, 'reliability', 'pass', 'pass^4=' + result.pass_power_k, '');
  } catch (err) { add(checks, 'reliability', 'fail', err.message, 'Fix the trial artifact.'); }
}

function checkExecution(checks, skillDir) {
  const input = path.join(skillDir, '.skillcanary', 'workflow.json');
  if (!fs.existsSync(input)) { add(checks, 'execution-mode', 'warn', 'no workflow audit configured', 'skillcanary execution audit .skillcanary/workflow.json'); return; }
  try {
    const result = execution.auditWorkflow(JSON.parse(fs.readFileSync(input, 'utf8')));
    if (result.issues.length) add(checks, 'execution-mode', 'fail', result.issues.join('; '), 'Do not use agent mode where deterministic or human approval is required.');
    else add(checks, 'execution-mode', 'pass', 'execution modes are coherent', '');
  } catch (err) { add(checks, 'execution-mode', 'fail', err.message, 'Fix the workflow artifact.'); }
}

function checkAdapters(checks) {
  const result = adapter.descriptorDoctor();
  if (!result.ok) add(checks, 'adapter-registry', 'fail', result.errors.join('; '), 'skillcanary adapter doctor');
  else if (result.warnings.length) add(checks, 'adapter-registry', 'warn', result.warnings.join('; '), 'Declare adapter permissions and forbidden domains.');
  else add(checks, 'adapter-registry', 'pass', result.count + ' adapter(s) valid', '');
}

function checkDrift(checks, skillDir) {
  const input = path.join(skillDir, '.skillcanary', 'outcomes.jsonl');
  if (!fs.existsSync(input)) {
    add(checks, 'drift', 'warn', 'no outcome history for drift detection', 'skillcanary drift check .skillcanary/outcomes.jsonl');
    return;
  }
  const records = readJsonl(input);
  const groups = {};
  for (const record of records) {
    const key = (record.skill || 'unknown') + '@' + (record.skill_hash || 'unknown');
    if (!groups[key]) groups[key] = [];
    const signals = record.signals || {};
    groups[key].push(Number(signals.user_correction_count || 0) + Number(signals.rework_turns || 0) + Number(signals.tool_error_count || 0) * 0.5 + (signals.completed === false ? 1 : 0));
  }
  const detected = Object.keys(groups).map(function (key) { return stats.cusum(groups[key].slice(-20), { threshold: 5, drift: 0.5 }); }).filter(function (item) { return item.detected; });
  if (detected.length) add(checks, 'drift', 'fail', detected.length + ' group(s) show change-point drift', 'Collect new incidents and re-run the error-budget check.');
  else add(checks, 'drift', 'pass', 'no change-point drift detected', '');
}

function checkPolicy(checks, skillDir) {
  const input = path.join(skillDir, '.skillcanary', 'decisions.jsonl');
  if (!fs.existsSync(input)) {
    add(checks, 'policy', 'warn', 'no decision history yet', 'Record decisions with skillcanary policy record.');
    return;
  }
  const result = policy.recommend(readJsonl(input), {}, 1, { algorithm: 'hybrid', seed: 7 });
  if (!result.recommendations.length) add(checks, 'policy', 'warn', 'no recommendation available', 'Collect more decisions.');
  else add(checks, 'policy', 'pass', 'top action: ' + result.recommendations[0].action + ' (hybrid score=' + result.recommendations[0].score.toFixed(3) + ')', '');
}

function checkEvidence(checks, skillDir) {
  const input = path.join(skillDir, '.skillcanary', 'evidence.jsonl');
  if (!fs.existsSync(input)) {
    add(checks, 'evidence-store', 'warn', 'no normalized evidence log yet', 'skillcanary evidence record evidence.json --log .skillcanary/evidence.jsonl');
    return;
  }
  try {
    const built = store.build(readJsonl(input));
    add(checks, 'evidence-store', 'pass', built.runs.length + ' run(s), ' + built.scores.length + ' case score(s)', 'skillcanary store index --input .skillcanary/evidence.jsonl --dir .skillcanary/store');
  } catch (err) {
    add(checks, 'evidence-store', 'fail', err.message, 'Fix the evidence envelope before indexing.');
  }
}

module.exports = function run(argv) {
  const args = parseArgs(argv);
  const skillDir = path.resolve(args._[0] || '.');
  const checks = [];
  const result = report.build(skillDir);
  if (result.errors.length) add(checks, 'skill-report', 'fail', result.errors.join('; '), 'Fix the report errors before changing the skill.');
  else if (result.warnings.length) add(checks, 'skill-report', 'warn', result.warnings.join('; '), 'Review warnings or keep them explicit.');
  else add(checks, 'skill-report', 'pass', 'lint, anchor, gate and MCP checks passed', '');
  checkHook(checks, skillDir);
  checkBudget(checks, skillDir);
  checkDrift(checks, skillDir);
  checkPolicy(checks, skillDir);
  checkTrajectory(checks, skillDir);
  checkReliability(checks, skillDir);
  checkExecution(checks, skillDir);
  checkAdapters(checks);
  checkEvidence(checks, skillDir);

  const failed = checks.filter(function (check) { return check.status === 'fail'; });
  const warned = checks.filter(function (check) { return check.status === 'warn'; });
  const output = {
    schema_version: 'skillcanary/doctor/v1',
    skill_dir: skillDir,
    verdict: failed.length ? 'FAIL' : (warned.length ? 'WARN' : 'PASS'),
    checks,
    next: checks.filter(function (check) { return check.status !== 'pass'; }).map(function (check) { return check.next; }).filter(Boolean)
  };

  if (args.json) printJson(output);
  else {
    process.stdout.write('SkillCanary doctor @ ' + skillDir + '\n');
    for (const check of checks) {
      const mark = check.status === 'pass' ? 'o' : (check.status === 'warn' ? '!' : 'x');
      process.stdout.write('  ' + mark + ' ' + check.id + ': ' + check.detail + '\n');
    }
    process.stdout.write('  Result: ' + output.verdict + '\n');
    for (const next of output.next) process.stdout.write('  Next: ' + next + '\n');
  }
  return failed.length || (args.strict && warned.length) ? 1 : 0;
};

module.exports.check = function check(skillDir) {
  return report.build(skillDir);
};
