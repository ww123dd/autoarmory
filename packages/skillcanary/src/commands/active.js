'use strict';

const fs = require('fs');
const path = require('path');
const { parseArgs, printJson, writeJson } = require('../lib/util');

const SEVERITY = { low: 1, medium: 2, high: 4, critical: 8 };
const DETERMINISM = { deterministic: 3, semantic: 1, unknown: 0 };

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(function (line) { return JSON.parse(line); });
}

function score(item) {
  const severity = SEVERITY[String(item.severity || 'medium').toLowerCase()] || 2;
  const determinism = DETERMINISM[String(item.determinism || 'unknown').toLowerCase()] || 0;
  const frequency = Number(item.frequency || 1);
  const unresolved = !/^TODO/i.test(String(item.assertion || '')) ? 2 : 0;
  const canary = item.canary ? 1 : 0;
  const statusBoost = item.status === 'case' || item.status === 'shadow' ? 1 : 0;
  const scoreValue = severity * 2 + determinism * 1.5 + Math.log2(frequency + 1) * 2 + unresolved + canary + statusBoost;
  return Math.round(scoreValue * 1000) / 1000;
}

module.exports = function run(argv) {
  const args = parseArgs(argv);
  const sub = args._[0] || 'rank';
  const input = path.resolve(args._[1] || args.input || '.skillcanary/advice.jsonl');
  if (sub !== 'rank') {
    process.stderr.write('Usage: skillcanary active rank <advice.jsonl> [--top 10] [--output active.jsonl] [--json]\n');
    return 2;
  }
  const items = readJsonl(input).map(function (item) {
    return Object.assign({}, item, {
      priority_score: score(item),
      priority_reasons: [
        'severity=' + (item.severity || 'medium'),
        'determinism=' + (item.determinism || 'unknown'),
        'frequency=' + (item.frequency || 1),
        /^TODO/i.test(String(item.assertion || '')) ? 'assertion-missing' : 'assertion-defined'
      ]
    });
  }).sort(function (a, b) { return b.priority_score - a.priority_score; }).slice(0, Number(args.top || 10));
  if (args.output) writeJson(path.resolve(args.output), { schema_version: 'skillcanary/active-cases/v1', generated_at: new Date().toISOString(), cases: items });
  else if (args.json) printJson(items);
  else {
    process.stdout.write('SkillCanary active cases @ ' + input + '\n');
    for (const item of items) process.stdout.write('  ' + item.priority_score.toFixed(2) + '  ' + item.id + '  ' + (item.observed_failure || '').slice(0, 100) + '\n');
  }
  return 0;
};

module.exports.score = score;
