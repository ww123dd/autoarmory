'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseArgs, readJson, writeJson, printJson } = require('../lib/util');

function makeRunId() {
  return 'run-' + crypto.randomBytes(6).toString('hex');
}

function normalize(input) {
  if (input.schema_version === 'skillcanary/evidence/v1') return input;
  const envelope = {
    schema_version: 'skillcanary/evidence/v1',
    run_id: input.run_id || makeRunId(),
    skill: input.skill || 'unknown-skill',
    skill_hash: input.skill_hash || input.skillHash || 'unknown',
    engine: input.engine || 'unknown',
    model: input.model || 'unknown',
    case_id: input.case_id || input.caseId || 'unknown',
    kind: input.kind || (input.check ? 'deterministic' : 'case'),
    observed_at: input.observed_at || new Date().toISOString()
  };
  if (envelope.kind === 'deterministic') {
    envelope.check = input.check;
    envelope.count_before = input.count_before;
    envelope.count_after = input.count_after;
    envelope.evidence = input.evidence;
  } else {
    envelope.before = input.before;
    envelope.after = input.after;
  }
  envelope.verification = input.verification || { verified_by: 'unknown', oracle: 'unknown', result: 'unknown' };
  envelope.artifacts = input.artifacts || [];
  return envelope;
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(function (line) { return JSON.parse(line); });
}

module.exports = function run(argv) {
  const args = parseArgs(argv);
  const sub = args._[0];
  const log = path.resolve(args.log || '.skillcanary/evidence.jsonl');
  if (sub === 'normalize') {
    const file = args._[1];
    if (!file) { process.stderr.write('Usage: skillcanary evidence normalize <input.json> [--output evidence.json]\n'); return 2; }
    const envelope = normalize(readJson(path.resolve(file)));
    if (args.output) writeJson(path.resolve(args.output), envelope);
    else printJson(envelope);
    return 0;
  }
  if (sub === 'record') {
    const file = args._[1];
    if (!file) { process.stderr.write('Usage: skillcanary evidence record <evidence.json> [--log evidence.jsonl]\n'); return 2; }
    const envelope = normalize(readJson(path.resolve(file)));
    fs.mkdirSync(path.dirname(log), { recursive: true });
    fs.appendFileSync(log, JSON.stringify(envelope) + '\n', 'utf8');
    process.stdout.write('Recorded evidence ' + envelope.run_id + ' -> ' + log + '\n');
    return 0;
  }
  if (sub === 'stats') {
    const items = readJsonl(log);
    const stats = items.reduce(function (acc, item) {
      const key = item.kind + ':' + item.skill;
      acc[key] = acc[key] || { kind: item.kind, skill: item.skill, count: 0, pass: 0, fail: 0, unknown: 0 };
      acc[key].count += 1;
      const result = item.verification && item.verification.result || 'unknown';
      if (result === 'pass') acc[key].pass += 1;
      else if (result === 'fail') acc[key].fail += 1;
      else acc[key].unknown += 1;
      return acc;
    }, {});
    const out = Object.keys(stats).sort().map(function (key) { return stats[key]; });
    if (args.json) printJson(out);
    else {
      process.stdout.write('SkillCanary evidence stats @ ' + log + '\n');
      for (const s of out) process.stdout.write('  ' + s.kind + '  ' + s.skill + '  n=' + s.count + '  pass=' + s.pass + '  fail=' + s.fail + '  unknown=' + s.unknown + '\n');
    }
    return 0;
  }
  process.stderr.write('Usage: skillcanary evidence <normalize|record|stats> ...\n');
  return 2;
};