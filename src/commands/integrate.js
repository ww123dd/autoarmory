'use strict';

const path = require('path');
const { parseArgs, readJson, printJson } = require('../lib/util');
const integrate = require('../lib/integrate');

module.exports = function run(argv) {
  const args = parseArgs(argv);
  const sub = args._[0];
  if (sub === 'list') { if (args.json) printJson(integrate.ADAPTERS); else for (const item of integrate.ADAPTERS) process.stdout.write('  ' + item.id + '  ' + item.kind + '  ' + item.description + '\n'); return 0; }
  if (sub === 'import') {
    const id = args._[1]; const file = args._[2];
    if (!id || !file) { process.stderr.write('Usage: autoarmory integrate import <id> <file> [--state .selfforge] [--json]\n'); return 2; }
    const source = path.resolve(file);
    const result = integrate.importData(id, readJson(source), { source: source });
    if (!result.ok) { process.stderr.write(result.errors.join('\n') + '\n'); return 1; }
    const state = path.resolve(args.state || '.selfforge');
    const written = integrate.writeImport(state, result);
    const output = { schema_version: 'autoarmory/integrate/v1', adapter: id, source: source, capability: written.capability, incidents: result.incidents.length, incident_ids: result.incidents.map(function (item) { return item.id; }), incident_modes: result.incidents.map(function (item) { return item.failure_mode; }), state: state };
    if (args.json) printJson(output); else process.stdout.write('Imported ' + id + ' -> ' + state + ' (capability=' + (written.capability || 'none') + ', incidents=' + result.incidents.length + ')\n');
    return 0;
  }
  process.stderr.write('Usage: autoarmory integrate <list|import> ...\n'); return 2;
};
