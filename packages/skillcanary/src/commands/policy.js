'use strict';

const fs = require('fs');
const path = require('path');
const { parseArgs, readJson, printJson } = require('../lib/util');
const policy = require('../lib/policy');

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(function (line) { return JSON.parse(line); });
}

function requireFields(record) {
  const errors = [];
  if (record.schema_version !== 'skillcanary/decision/v1') errors.push('schema_version must be skillcanary/decision/v1');
  for (const key of ['id', 'state', 'action', 'prediction', 'outcome', 'verification']) if (!record[key]) errors.push('missing ' + key);
  if (record.state) for (const key of ['skill', 'task_context', 'failure_mode']) if (!record.state[key]) errors.push('missing state.' + key);
  if (record.action) for (const key of ['type', 'target', 'summary']) if (!record.action[key]) errors.push('missing action.' + key);
  return errors;
}

function contextFromArgs(args) {
  const context = {};
  for (const key of ['failure-mode', 'skill', 'risk', 'has-mcp', 'task-context']) {
    if (args[key] !== undefined) context[key.replace(/-/g, '_')] = args[key];
  }
  return context;
}

module.exports = function run(argv) {
  const args = parseArgs(argv);
  const sub = args._[0];
  const log = path.resolve(args.log || '.skillcanary/decisions.jsonl');

  if (sub === 'record') {
    const file = args._[1];
    if (!file) { process.stderr.write('Usage: skillcanary policy record <decision.json> [--log decisions.jsonl]\n'); return 2; }
    const record = readJson(path.resolve(file));
    const errors = requireFields(record);
    if (errors.length) { for (const error of errors) console.error('x ' + error); return 1; }
    record.reward = Number.isFinite(record.reward) ? record.reward : policy.computeReward(record);
    record.reward_vector = policy.rewardVector(record);
    fs.mkdirSync(path.dirname(log), { recursive: true });
    fs.appendFileSync(log, JSON.stringify(record) + '\n', 'utf8');
    process.stdout.write('Recorded decision ' + record.id + ' reward=' + record.reward + '\n');
    return 0;
  }

  if (sub === 'stats') {
    const records = readJsonl(log);
    const stats = policy.summarize(records, contextFromArgs(args));
    const frontier = policy.pareto(records, contextFromArgs(args));
    const output = { actions: stats, pareto: frontier.map(function (item) { return item.action; }) };
    if (args.json) printJson(output);
    else {
      process.stdout.write('SkillCanary policy stats @ ' + log + '\n');
      for (const item of stats) process.stdout.write('  ' + item.action + '  n=' + item.count + '  mean=' + item.mean.toFixed(3) + '  std=' + item.stddev.toFixed(3) + '\n');
      process.stdout.write('  Pareto: ' + output.pareto.join(', ') + '\n');
    }
    return 0;
  }

  if (sub === 'recommend') {
    const context = contextFromArgs(args);
    const result = policy.recommend(readJsonl(log), context, Number(args.top || 3), {
      algorithm: args.algorithm || 'ucb',
      seed: Number(args.seed || 1),
      exploration: args.exploration !== undefined ? Number(args.exploration) : undefined,
      constraints: {
        maxRisk: args['max-risk'] !== undefined ? Number(args['max-risk']) : undefined,
        minSamples: args['min-samples'] !== undefined ? Number(args['min-samples']) : undefined
      }
    });
    if (args.json) printJson(result);
    else {
      process.stdout.write('SkillCanary policy recommend [' + result.algorithm + ']\n');
      for (const item of result.recommendations) {
        process.stdout.write('  ' + item.action + '  score=' + item.score.toFixed(3) + '  mean=' + item.mean.toFixed(3) + '  ucb=' + item.ucb.toFixed(3) + '  thompson=' + item.thompson.toFixed(3) + '  n=' + item.count + '\n');
      }
      if (!result.recommendations.length) process.stdout.write('  No decision history for this context.\n');
      if (result.masked) process.stdout.write('  Masked actions: ' + result.masked + '\n');
    }
    return 0;
  }

  if (sub === 'pareto') {
    const result = policy.pareto(readJsonl(log), contextFromArgs(args));
    if (args.json) printJson(result);
    else {
      process.stdout.write('SkillCanary policy pareto\n');
      for (const item of result) process.stdout.write('  ' + item.action + '  reward=' + item.summary.mean.toFixed(3) + '  regressed=' + item.summary.objectives.regressed.toFixed(3) + '  corrections=' + item.summary.objectives.user_corrections.toFixed(3) + '\n');
    }
    return 0;
  }

  if (sub === 'drift') {
    const result = policy.drift(readJsonl(log), { window: Number(args.window || 20), threshold: Number(args.threshold || 5) });
    if (args.json) printJson(result);
    else {
      process.stdout.write('SkillCanary policy drift\n');
      for (const item of result) process.stdout.write('  ' + (item.detected ? 'x ' : 'o ') + item.action + '  score=' + item.score.toFixed(3) + '  index=' + item.index + '\n');
    }
    return result.some(function (item) { return item.detected; }) ? 1 : 0;
  }

  if (sub === 'simulate' || sub === 'lab') {
    const result = policy.simulate({ horizon: Number(args.horizon || 100), seed: Number(args.seed || 1) });
    if (args.json) printJson(result);
    else {
      process.stdout.write('SkillCanary policy simulation\n');
      for (const name of Object.keys(result.algorithms)) process.stdout.write('  ' + name + '  mean=' + result.algorithms[name].mean_reward.toFixed(3) + '  best=' + result.algorithms[name].best_action + '\n');
    }
    return 0;
  }

  process.stderr.write('Usage: skillcanary policy <record|stats|recommend|pareto|drift|simulate> ...\n');
  return 2;
};
