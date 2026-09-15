'use strict';

const path = require('path');
const { parseArgs, readJson, printJson } = require('../lib/util');
const mechanism = require('../lib/mechanism');

function fail(result, json) {
  if (json) printJson(result); else process.stderr.write(result.errors.join('\n') + '\n');
  return 1;
}
function usage() {
  process.stderr.write('Usage: autoarmory mechanism <usage|case|register|list|run|close|effectiveness> [options]\n');
  return 2;
}
module.exports = function run(argv) {
  const args = parseArgs(argv);
  const state = path.resolve(args.state || '.selfforge');
  const sub = args._[0];
  const action = args._[1];

  if (sub === 'usage' && action === 'register') {
    if (!args._[2]) return usage();
    const result = mechanism.registerUsageContract(state, readJson(path.resolve(args._[2])));
    if (result.ok) { if (args.json) printJson(result); else process.stdout.write('Registered usage contract ' + result.usage_contract.id + '\n'); return 0; }
    return fail(result, !!args.json);
  }
  if (sub === 'usage' && action === 'list') { const rows = mechanism.listUsageContracts(state); if (args.json) printJson(rows); else for (const row of rows) process.stdout.write('  ' + row.id + '  ' + row.capability_id + '\n'); return rows.length ? 0 : 1; }
  if (sub === 'case' && action === 'admit') {
    if (!args._[2]) return usage();
    const result = mechanism.admitCase(state, readJson(path.resolve(args._[2])));
    if (result.ok) { if (args.json) printJson(result); else process.stdout.write('Admitted case ' + result.case.id + '\n'); return 0; }
    return fail(result, !!args.json);
  }
  if (sub === 'case' && action === 'list') { const rows = mechanism.listCases(state); if (args.json) printJson(rows); else for (const row of rows) process.stdout.write('  ' + row.id + '  ' + row.failure_mode + '\n'); return rows.length ? 0 : 1; }
  if (sub === 'register') {
    if (!args._[1]) return usage();
    const result = mechanism.registerMechanism(state, readJson(path.resolve(args._[1])));
    if (result.ok) { if (args.json) printJson(result); else process.stdout.write('Registered mechanism ' + result.mechanism.id + '\n'); return 0; }
    return fail(result, !!args.json);
  }
  if (sub === 'list') { const rows = mechanism.listMechanisms(state); if (args.json) printJson(rows); else for (const row of rows) process.stdout.write('  ' + row.id + '  ' + row.status + '\n'); return rows.length ? 0 : 1; }
  if (sub === 'run') {
    if (!args._[1]) return usage();
    const result = mechanism.recordMechanismRun(state, readJson(path.resolve(args._[1])));
    if (result.ok) { if (args.json) printJson(result); else process.stdout.write('Recorded mechanism run ' + result.run.id + '\n'); return 0; }
    return fail(result, !!args.json);
  }
  if (sub === 'close') {
    if (!args.case || !args.run) return usage();
    const result = mechanism.closeCase(state, args.case, args.run);
    if (result.ok) { if (args.json) printJson(result); else process.stdout.write('Closed case ' + args.case + '\n'); return 0; }
    return fail(result, !!args.json);
  }
  if (sub === 'effectiveness') {
    const result = mechanism.effectiveness(state, args._[1] || null);
    if (args.json) printJson(result); else process.stdout.write('  ' + result.status + '  runs=' + result.runs + '  closure_rate=' + result.closure_rate + '\n');
    return result.status === 'insufficient_data' ? 1 : 0;
  }
  return usage();
};