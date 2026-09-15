'use strict';

const path = require('path');
const { parseArgs, readJson, printJson } = require('../lib/util');
const mechanism = require('../lib/mechanism');

function usage() {
  process.stderr.write('Usage: autoarmory mechanism <case-admit|register|list|run|close|status> [options]\n');
  return 2;
}
function fail(result, json) {
  if (json) printJson(result); else process.stderr.write((result.errors || ['mechanism command failed']).join('\n') + '\n');
  return 1;
}
function ok(result, json, message) {
  if (json) printJson(result); else process.stdout.write(message + '\n');
  return 0;
}

module.exports = function run(argv) {
  const args = parseArgs(argv);
  const state = path.resolve(args.state || '.selfforge');
  const sub = args._[0];

  if (sub === 'case-admit') {
    if (!args._[1]) return usage();
    const result = mechanism.admitCase(state, readJson(path.resolve(args._[1])));
    return result.ok ? ok(result, !!args.json, 'Admitted case ' + result.case.id) : fail(result, !!args.json);
  }
  if (sub === 'register') {
    if (!args._[1]) return usage();
    const result = mechanism.registerMechanism(state, readJson(path.resolve(args._[1])));
    return result.ok ? ok(result, !!args.json, 'Registered mechanism ' + result.mechanism.id) : fail(result, !!args.json);
  }
  if (sub === 'list') {
    const rows = mechanism.listMechanisms(state);
    if (args.json) printJson(rows); else for (const row of rows) process.stdout.write('  ' + row.id + '  ' + row.status + '\n');
    return rows.length ? 0 : 1;
  }
  if (sub === 'run') {
    if (!args._[1]) return usage();
    const result = mechanism.recordMechanismRun(state, readJson(path.resolve(args._[1])));
    return result.ok ? ok(result, !!args.json, 'Recorded mechanism run ' + result.run.id) : fail(result, !!args.json);
  }
  if (sub === 'close') {
    if (!args.case || !args.run) return usage();
    const result = mechanism.closeCase(state, args.case, args.run);
    return result.ok ? ok(result, !!args.json, 'Closed case ' + args.case) : fail(result, !!args.json);
  }
  if (sub === 'status') {
    if (!args._[1]) return usage();
    const result = mechanism.status(state, args._[1]);
    if (!result.ok) return fail(result, !!args.json);
    if (args.json) printJson(result); else process.stdout.write('  ' + result.status + '  ' + result.reason + '\n');
    return result.status === 'unverified' || result.status === 'bypassed' || result.status === 'expired' ? 1 : 0;
  }
  return usage();
};