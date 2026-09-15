'use strict';
const path = require('path');
const { parseArgs, printJson, writeJson } = require('../lib/util');
const { fingerprint } = require('../lib/environment');
module.exports = function run(argv) {
  const args = parseArgs(argv);
  const dir = path.resolve(args._[0] || '.');
  const result = fingerprint(dir);
  if (args.write) writeJson(path.join(dir, '.selfforge', 'environment.json'), result); else printJson(result);
  return 0;
};
