'use strict';

const fs = require('fs');
const path = require('path');
const { parseArgs, printJson } = require('../lib/util');
const stats = require('../lib/stats');

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(function (line) { return JSON.parse(line); });
}

function riskOf(record) {
  const s = record.signals || {};
  return Number(s.user_correction_count || 0) + Number(s.rework_turns || 0) + Number(s.tool_error_count || 0) * 0.5 + (s.completed === false ? 1 : 0);
}

module.exports = function run(argv) {
  const args = parseArgs(argv);
  const sub = args._[0] || 'check';
  const input = path.resolve(args._[1] || args.input || '.skillcanary/outcomes.jsonl');
  if (sub !== 'check') {
    process.stderr.write('Usage: skillcanary drift check [outcomes.jsonl] [--window 20] [--threshold 5] [--json]\n');
    return 2;
  }
  const records = readJsonl(input);
  const groups = {};
  for (const record of records) {
    const key = record.skill + '@' + record.skill_hash;
    if (!groups[key]) groups[key] = [];
    groups[key].push(record);
  }
  const result = Object.keys(groups).map(function (key) {
    const values = groups[key].slice(-Number(args.window || 20)).map(riskOf);
    const change = stats.cusum(values, { threshold: Number(args.threshold || 5), drift: Number(args.drift || 0.5) });
    return Object.assign({ skill: groups[key][0].skill, skill_hash: groups[key][0].skill_hash, samples: values.length, risk: values }, change);
  }).sort(function (a, b) { return b.score - a.score; });
  if (args.json) printJson(result);
  else {
    process.stdout.write('SkillCanary drift check @ ' + input + '\n');
    for (const item of result) process.stdout.write('  ' + (item.detected ? 'x ' : 'o ') + item.skill + '  score=' + item.score.toFixed(3) + '  index=' + item.index + '\n');
  }
  return result.some(function (item) { return item.detected; }) ? 1 : 0;
};
