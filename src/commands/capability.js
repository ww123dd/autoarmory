'use strict';

const fs = require('fs');
const path = require('path');
const { parseArgs, readJson, readJsonl, writeJsonl, printJson } = require('../lib/util');
const capability = require('../lib/capability');

function usage() {
  process.stderr.write('Usage: autoarmory capability <register|list|health|route|outcome|drift|conformance> [options]\n');
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
    const raw = fs.readFileSync(path.resolve(input), 'utf8');
    let values;
    try { values = JSON.parse(raw); } catch (_) { values = raw.split(/\r?\n/).filter(Boolean).map(function (line) { return JSON.parse(line); }); }
    if (!Array.isArray(values)) values = [values];
    const registered = [];
    let result = { ok: true, count: 0 };
    for (const value of values) {
      result = capability.registerCapability(file, value, { force: !!args.force });
      if (!result.ok) break;
      registered.push(result.capability);
    }
    if (result.ok) result = { ok: true, count: registered.length, capabilities: registered };
    if (args.json) printJson(result);
    else if (result.ok) process.stdout.write('Registered ' + registered.length + ' capability(ies) -> ' + file + '\n');
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

  // A routing decision is only a decision once it is durable: shadow evaluation
  // needs the record of what was recommended before it can compare it with what
  // was actually used.
  if (sub === 'route') {
    const input = args._[1];
    if (!input) return usage();
    const request = readJson(path.resolve(input));
    const result = capability.route(capability.readCapabilities(file), request, { seed: args.seed });
    let decisionFile = null;
    if (result.ok && !args['no-write']) {
      decisionFile = path.join(state, 'routing-decisions.jsonl');
      const rows = readJsonl(decisionFile);
      rows.push(result);
      writeJsonl(decisionFile, rows);
    }
    if (args.json) printJson(Object.assign({}, result, { decision_file: decisionFile }));
    else if (result.ok) process.stdout.write('Selected ' + result.selected[0].id + ' for ' + result.task_id + (decisionFile ? '  -> ' + decisionFile : '') + '\n');
    else process.stderr.write(result.errors.join('\n') + '\n');
    return result.ok ? 0 : 1;
  }

  if (sub === 'outcome') {
    const input = args._[1];
    if (!input) return usage();
    const result = capability.recordOutcome(file, path.join(state, 'capability-outcomes.jsonl'), readJson(path.resolve(input)));
    if (args.json) printJson(result); else if (result.ok) process.stdout.write('Recorded outcome for ' + result.capability.id + ' applied=' + result.applied + '\n'); else process.stderr.write(result.errors.join('\n') + '\n');
    return result.ok ? 0 : 1;
  }

  if (sub === 'drift') {
    const id = args._[1] || null;
    const result = capability.detectDrift(readJsonl(path.join(state, 'capability-outcomes.jsonl')), { capability_id: id || undefined, threshold: Number(args.threshold || 0.3) });
    if (args.json) printJson(result); else process.stdout.write('  ' + result.status + '  samples=' + result.samples + '\n');
    return result.status === 'insufficient_data' ? 1 : 0;
  }

  if (sub === 'conformance') {
    const id = args._[1];
    if (!id) return usage();
    const item = capability.readCapabilities(file).find(function (entry) { return entry.id === id; });
    if (!item) { process.stderr.write('capability not found: ' + id + '\n'); return 1; }
    const result = capability.conformanceCheck(item);
    if (args.json) printJson(result); else process.stdout.write('  ' + (result.ok ? 'PASS' : 'FAIL') + '  ' + id + '\n');
    return result.ok ? 0 : 1;
  }

  return usage();
};