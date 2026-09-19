#!/usr/bin/env node
'use strict';
const os = require('os');
const path = require('path');
const { parseArgs, printJson } = require('../src/lib/util');
const digest = require('../src/lib/session-digest');
const args = parseArgs(process.argv.slice(2));
const stopState = path.resolve(process.env.AUTOARMORY_STATE || process.env.AUTOARMORY_STOP_STATE || path.join(os.homedir(), '.codex', 'autoarmory', 'stop-shadow'));
const engineDir = path.resolve(args.state || path.join(stopState, 'change-inspector'));
const report = digest.digestFromEngine(engineDir, { days: args.days, limit: args.limit, top: args.top });
if (args.json) printJson(report);
else {
  process.stdout.write('sessions=' + report.aggregate.sessions + '  records=' + report.records_input + '  checks=' + report.aggregate.checks + '  gaps=' + report.aggregate.check_gaps + '  failures=' + report.aggregate.structured_failures + '  risk=' + report.aggregate.risk_signals + '\n');
  for (const session of report.sessions) {
    process.stdout.write(session.day + ' [' + (session.span[0] || '?') + '~' + (session.span[1] || '?') + '] records=' + session.records + ' files=' + session.files_changed + ' checks=' + session.checks + ' gaps=' + session.check_gaps + ' failures=' + session.structured_failures + ' risk=' + session.risk_signals + ' repeats>=3:' + session.repeat_patterns_ge3 + '\n');
    for (const command of session.top_commands) process.stdout.write('    ' + command.count + 'x ' + command.command + '\n');
  }
}
