'use strict';

const path = require('path');
const { parseArgs, readJson, readJsonl, writeJsonl, printJson } = require('../lib/util');
const capability = require('../lib/capability');

function usage() {
  process.stderr.write('Usage: autoarmory capability <register|list|health|route|portfolio> [options]\n');
  return 2;
}

module.exports = function run(argv) {
  const args = parseArgs(argv);
  const sub = args._[0];
  const state = path.resolve(args.state || '.selfforge');
  const file = path.join(state, 'capabilities.jsonl');

  if (sub === 'register') {
    const input = args._[1];
    if (!input) return usage();
    const result = capability.registerCapability(file, readJson(path.resolve(input)), { force: !!args.force });
    if (args.json) printJson(result);
    else if (result.ok) process.stdout.write('Registered capability ' + result.capability.id + ' -> ' + file + '\n');
    else process.stderr.write(result.errors.join('\n') + '\n');
    return result.ok ? 0 : 1;
  }

  if (sub === 'list') {
    let items = capability.readCapabilities(file);
    if (args.kind) items = items.filter(function (item) { return item.kind === args.kind; });
    if (args.json) printJson(items); else for (const item of items) process.stdout.write('  ' + item.id + '  ' + item.kind + '  ' + item.version + '  ' + item.health + '\n');
    return items.length ? 0 : 1;
  }

  if (sub === 'health') {
    const rows = capability.healthRows(capability.readCapabilities(file));
    const result = { schema_version: 'autoarmory/capability-health/v1', generated_at: new Date().toISOString(), summary: { total: rows.length, healthy: rows.filter(function (row) { return row.status === 'healthy'; }).length, degraded: rows.filter(function (row) { return row.status === 'degraded'; }).length, offline: rows.filter(function (row) { return row.status === 'offline'; }).length }, capabilities: rows };
    if (args.json) printJson(result); else for (const row of rows) process.stdout.write('  ' + row.status + '  ' + row.id + '  age=' + row.age_days.toFixed(1) + 'd\n');
    return rows.length ? 0 : 1;
  }

  if (sub === 'route') {
    const requestFile = args.request;
    if (!requestFile) return usage();
    const capabilities = capability.readCapabilities(file);
    const request = readJson(path.resolve(requestFile));
    const result = capability.route(capabilities, request, { seed: Number(args.seed || 1) });
    const decisionFile = path.join(state, 'routing-decisions.jsonl');
    if (result.ok) {
      const decisions = readJsonl(decisionFile);
      decisions.push(result);
      writeJsonl(decisionFile, decisions);
    }
    if (args.json) printJson(result); else if (result.ok) process.stdout.write('  ' + result.selected[0].id + '  score=' + result.selected[0].score.toFixed(3) + '\n'); else process.stderr.write(result.errors.join('\n') + '\n');
    return result.ok ? 0 : 1;
  }

  if (sub === 'portfolio') {
    const result = capability.portfolio(capability.readCapabilities(file));
    if (args.json) printJson(result); else for (const item of result.frontier) process.stdout.write('  ' + item.id + '  reliability=' + item.reliability.toFixed(3) + '  cost=' + item.cost + '  p95=' + item.latency_p95 + '\n');
    return result.frontier.length ? 0 : 1;
  }

  return usage();
};
