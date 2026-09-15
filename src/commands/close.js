'use strict';

const path = require('path');
const { parseArgs, printJson } = require('../lib/util');
const mechanism = require('../lib/mechanism');

module.exports = function run(argv) {
  const args = parseArgs(argv);
  if (!args.case || !args.run) {
    process.stderr.write('Usage: autoarmory close --case <case-id> --run <run-id> [--state .selfforge] [--repo <repo-root>] [--json]\n');
    return 2;
  }
  const state = path.resolve(args.state || '.selfforge');
  const options = { repo: args.repo ? path.resolve(args.repo) : process.cwd() };
  const result = mechanism.closeCase(state, args.case, args.run, options);
  if (!result.ok) {
    if (args.json) printJson(result); else process.stderr.write(result.errors.join('\n') + '\n');
    return 1;
  }
  const status = mechanism.status(state, result.closure.mechanism_id, options);
  const output = { ok: true, closure: result.closure, status: status };
  if (args.json) printJson(output); else process.stdout.write('  closed  ' + result.closure.case_id + '  verdict=' + status.status + '\n');
  return 0;
};
