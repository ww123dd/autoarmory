'use strict';
const fs = require('fs');
const path = require('path');
const { parseArgs, printJson, readJsonl } = require('../lib/util');
const skillcanary = require('../lib/skillcanary');
module.exports = function run(argv) {
  const args = parseArgs(argv);
  const dir = path.resolve(args._[0] || '.');
  const state = path.join(dir, '.selfforge');
  const checks = [];
  function add(id, ok, detail) { checks.push({ id, ok: !!ok, detail }); }
  add('state', fs.existsSync(state), state);
  add('incidents', fs.existsSync(path.join(state, 'incidents.jsonl')) && readJsonl(path.join(state, 'incidents.jsonl')).length > 0, 'observed incidents');
  add('candidates', fs.existsSync(path.join(state, 'candidates.jsonl')) && readJsonl(path.join(state, 'candidates.jsonl')).length > 0, 'proposed candidates');
  add('environment', fs.existsSync(path.join(state, 'environment.json')), 'environment fingerprint');
  add('capabilities', fs.existsSync(path.join(state, 'capabilities.jsonl')) && readJsonl(path.join(state, 'capabilities.jsonl')).length > 0, 'capability registry');
  add('capability-outcomes', fs.existsSync(path.join(state, 'capability-outcomes.jsonl')) && readJsonl(path.join(state, 'capability-outcomes.jsonl')).length > 0, 'capability outcome history');
  add('decisions', fs.existsSync(path.join(state, 'decisions.jsonl')) && readJsonl(path.join(state, 'decisions.jsonl')).length > 0, 'recorded outcomes');
  add('skillcanary', !!skillcanary.resolve(args.skillcanary || undefined, dir), 'SkillCanary dependency');
  const result = { schema_version: 'selfforge/doctor/v1', ok: checks.every(function (check) { return check.ok; }), checks };
  if (args.json) printJson(result); else { for (const check of checks) process.stdout.write('  ' + (check.ok ? 'o ' : 'x ') + check.id + ': ' + check.detail + '\n'); process.stdout.write('  Result: ' + (result.ok ? 'PASS' : 'INCOMPLETE') + '\n'); }
  return 0;
};
