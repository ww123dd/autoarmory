'use strict';

const fs = require('fs');
const path = require('path');
const { parseArgs } = require('../lib/util');

module.exports = function run(argv) {
  const args = parseArgs(argv);
  if (!args.session || !args.skill || !args.hash) {
    process.stderr.write('Usage: skillcanary track --session <id> --skill <name> --hash <hash> [--corrections N] [--rework N] [--tool-errors N] [--completed true|false]\n');
    return 2;
  }
  const out = path.resolve(args.output || '.skillcanary/outcomes.jsonl');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const record = {
    session_id: args.session,
    skill: args.skill,
    skill_hash: args.hash,
    observed_at: new Date().toISOString(),
    signals: {
      user_correction_count: Number(args.corrections || 0),
      rework_turns: Number(args.rework || 0),
      tool_error_count: Number(args['tool-errors'] || 0),
      completed: args.completed === 'true'
    }
  };
  fs.appendFileSync(out, JSON.stringify(record) + '\n', 'utf8');
  process.stdout.write('Recorded outcome for ' + args.skill + ' -> ' + out + '\n');
  return 0;
};