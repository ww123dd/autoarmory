'use strict';
const fs = require('fs');
const path = require('path');
const { parseArgs, writeJson } = require('../lib/util');
module.exports = function run(argv) {
  const args = parseArgs(argv);
  const dir = path.resolve(args._[0] || '.');
  const state = path.join(dir, '.selfforge');
  fs.mkdirSync(state, { recursive: true });
  const files = {
    'config.json': { schema_version: 'selfforge/config/v1', skillcanary_home: args.skillcanary || '', window: 20, human_approval_risk: 'high' },
    'incidents.jsonl': '',
    'candidates.jsonl': '',
    'decisions.jsonl': ''
  };
  for (const [name, value] of Object.entries(files)) { const file = path.join(state, name); if (!fs.existsSync(file)) { if (typeof value === 'string') fs.writeFileSync(file, value, 'utf8'); else writeJson(file, value); } }
  process.stdout.write('AutoArmory initialized at ' + state + '\n');
  return 0;
};
