'use strict';

const path = require('path');
const { parseArgs, printJson } = require('../lib/util');
const scenario = require('../lib/scenario');
const capability = require('../lib/capability');
const scenarioBench = require('../lib/scenario-bench');

module.exports = function run(argv) {
  const args = parseArgs(argv);
  const sub = args._[0];
  if (sub === 'list') { const list = scenario.listProfiles(); if (args.json) printJson(list); else for (const item of list) process.stdout.write('  ' + item.id + '  ' + item.title + '\n'); return list.length ? 0 : 1; }
  if (sub === 'show') { const profile = scenario.getProfile(args._[1]); if (!profile) { process.stderr.write('scenario not found\n'); return 1; } if (args.json) printJson(profile); else process.stdout.write(profile.id + ': ' + profile.title + '\n'); return 0; }
  if (sub === 'plan') { const profile = scenario.getProfile(args._[1]); if (!profile) { process.stderr.write('scenario not found\n'); return 1; } const state = path.resolve(args.state || '.selfforge'); const result = scenario.plan(profile, capability.readCapabilities(path.join(state, 'capabilities.jsonl'))); if (args.json) printJson(result); else process.stdout.write('  ' + (result.ready ? 'READY' : 'GAPS') + ' ' + result.profile + ' missing=' + result.missing.join(',') + '\n'); return result.ready ? 0 : 1; }
  if (sub === 'bench') {
    const profile = args._[1];
    if (!profile) { process.stderr.write('Usage: autoarmory scenario bench <profile> [--real outcomes.jsonl] [--min 30] [--json]\n'); return 2; }
    const result = scenarioBench.run(profile, { real: args.real ? path.resolve(args.real) : null, min: Number(args.min || 30) });
    if (args.json) printJson(result); else process.stdout.write('  ' + result.proof_status + '  ' + profile + '\n');
    return result.proof_status === 'insufficient_data' || result.proof_status === 'unsupported_profile' ? 1 : 0;
  }

  process.stderr.write('Usage: autoarmory scenario <list|show|plan> ...\n'); return 2;
};
