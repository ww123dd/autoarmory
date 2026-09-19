#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { parseArgs, printJson, readJsonl, writeJson } = require('../src/lib/util');
const activation = require('../src/lib/mechanism-activation');

function fail(message) { process.stderr.write(message + '\n'); process.exit(2); }
const args = parseArgs(process.argv.slice(2));
if (!args.candidates) fail('--candidates <mechanism-candidates.jsonl> is required');
const repo = path.resolve(args.repo || process.cwd());
const file = path.resolve(args.candidates);
if (!fs.existsSync(file)) fail('candidate file not found: ' + file);
let candidates;
try { candidates = readJsonl(file); } catch (error) { fail('candidate file is unreadable: ' + error.message); }
const rows = candidates.map(function (candidate) {
  return { mechanism_id: candidate.mechanism_id || null, activation: activation.audit(candidate, { repo: repo }) };
});
const report = {
  schema_version: 'autoarmory/mechanism-activation-report/v1',
  generated_at: new Date().toISOString(),
  repo: repo,
  candidates_file: file,
  candidate_count: rows.length,
  active_count: rows.filter(function (row) { return row.activation.status === 'active'; }).length,
  candidates: rows
};
if (args.output) writeJson(path.resolve(args.output), report);
if (args.json) printJson(report);
else {
  process.stdout.write('mechanism activation: candidates=' + report.candidate_count + ' active=' + report.active_count + '\n');
  for (const row of rows) process.stdout.write('  ' + String(row.activation.status).padEnd(9) + row.mechanism_id + ' verifier=' + (row.activation.verifier_id || '-') + ' coverage=' + row.activation.coverage + (row.activation.blockers.length ? ' blockers=' + row.activation.blockers.join(',') : '') + '\n');
}
process.exit(0);
