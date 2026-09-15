'use strict';

const fs = require('fs');
const path = require('path');
const { parseArgs, readJson, writeJsonl, readJsonl } = require('../lib/util');

module.exports = function run(argv) {
  const args = parseArgs(argv);
  const state = path.resolve(args.state || '.selfforge');
  let record;
  if (args._[0] && fs.existsSync(path.resolve(args._[0]))) {
    record = readJson(path.resolve(args._[0]));
  } else {
    record = {
      schema_version: 'selfforge/decision/v1',
      id: args.id || 'dec-' + Date.now(),
      candidate_id: args.candidate || 'unknown',
      action: args.action || 'unknown',
      outcome: args.outcome ? JSON.parse(args.outcome) : { fixed: args.fixed === 'true', regressed: args.regressed === 'true' },
      reward: Number(args.reward || 0),
      verified: args.verified === 'true',
      recorded_at: new Date().toISOString()
    };
  }
  if (!record.schema_version) record.schema_version = 'selfforge/decision/v1';
  if (!record.id) record.id = 'dec-' + Date.now();
  if (!record.recorded_at) record.recorded_at = new Date().toISOString();
  const file = path.join(state, 'decisions.jsonl');
  const existing = readJsonl(file);
  existing.push(record);
  writeJsonl(file, existing);
  process.stdout.write('Recorded decision ' + record.id + ' -> ' + file + '\n');
  return 0;
};
