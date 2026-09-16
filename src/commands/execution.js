'use strict';

const path = require('path');
const { parseArgs, readJson, printJson } = require('../lib/util');
const execution = require('../lib/execution-trace');

function usage() {
  process.stderr.write('Usage: autoarmory execution <record|list|friction> [trace.json] [--state .selfforge] [--json]\n');
  return 2;
}

module.exports = function run(argv) {
  const args = parseArgs(argv);
  const sub = args._[0];
  const state = path.resolve(args.state || '.selfforge');
  if (sub === 'experiment') return require('./experiment')(argv.slice(1));
  if (sub === 'friction') {
    const friction = require('../lib/friction');
    const action = args._[1];
    if (action === 'record') {
      const input = args._[2];
      if (!input) return usage();
      const result = friction.recordFrictionEvent(state, readJson(path.resolve(input)));
      if (args.json) printJson(result);
      else if (result.ok) process.stdout.write('Recorded friction event ' + result.event.id + ' decision=' + result.event.decision + '\n');
      else process.stderr.write(result.errors.join('\n') + '\n');
      return result.ok ? 0 : 1;
    }
    if (action === 'list') {
      const events = friction.readFrictionEvents(state);
      if (args.json) printJson(events);
      else for (const event of events) process.stdout.write('  ' + event.decision + '  ' + event.id + '\n');
      return events.length ? 0 : 1;
    }
    return usage();
  }
  if (sub === 'record') {
    const input = args._[1];
    if (!input) return usage();
    const result = execution.recordExecutionTrace(state, readJson(path.resolve(input)));
    if (args.json) printJson(result);
    else if (result.ok) process.stdout.write('Recorded execution trace ' + result.trace.id + ' status=' + result.trace.status + '\n');
    else process.stderr.write(result.errors.join('\n') + '\n');
    return result.ok ? 0 : 1;
  }
  if (sub === 'list') {
    const traces = execution.readExecutionTraces(state);
    if (args.json) printJson(traces);
    else for (const trace of traces) process.stdout.write('  ' + trace.status + '  ' + trace.id + '  ' + trace.skill_id + '\n');
    return traces.length ? 0 : 1;
  }
  return usage();
};