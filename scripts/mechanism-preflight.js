#!/usr/bin/env node
'use strict';

// Mechanism preflight: if a repository has mechanism state, an unverified,
// expired, or bypassed mechanism blocks the commit. A verdict without a
// consumer is decoration; this is the first real consumer of mechanism status.

const fs = require('fs');
const path = require('path');
const mechanism = require('../src/lib/mechanism');
const verify = require('../src/lib/verify');

const repo = process.cwd();
const state = path.resolve(process.env.AUTOARMORY_STATE || path.join(repo, '.selfforge'));
const mechanismsFile = path.join(state, 'mechanisms.jsonl');
if (!fs.existsSync(mechanismsFile)) {
  process.stdout.write('mechanism preflight: no mechanism state\n');
  process.exit(0);
}
let records = [];
try {
  records = fs.readFileSync(mechanismsFile, 'utf8').split(/\r?\n/).filter(Boolean).map(function (line) { return JSON.parse(line); });
} catch (error) {
  process.stderr.write('MECHANISM_PREFLIGHT_BLOCK\nstate unreadable: ' + error.message + '\n');
  process.exit(2);
}
function readJsonl(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(function (line) { return JSON.parse(line); }) : [];
}
function byTime(a, b) { return Date.parse(a.finished_at || a.recorded_at || 0) - Date.parse(b.finished_at || b.recorded_at || 0); }
function byClosedAt(a, b) { return Date.parse(a.closed_at || 0) - Date.parse(b.closed_at || 0); }

const runs = readJsonl(path.join(state, 'mechanism-runs.jsonl'));
const closures = readJsonl(path.join(state, 'closures.jsonl'));
const blockers = [];
let staleVerdictEscapes = 0;
for (const record of records) {
  const status = mechanism.status(state, record.id, { repo: repo });
  if (!status.ok || (status.status !== 'verified' && status.status !== 'closed')) {
    blockers.push(record.id + ': ' + (status.status || 'error') + ' - ' + (status.reason || (status.errors || []).join('; ')));
    continue;
  }
  // Independent audit of the reported verdict: the run that supports it has to
  // still name the runner the active profile declares.
  const own = runs.filter(function (item) { return item.mechanism_id === record.id; });
  const latest = own.slice().sort(byTime).pop() || null;
  const closure = closures.filter(function (item) { return item.mechanism_id === record.id; }).sort(byClosedAt).pop() || null;
  const supporting = status.status === 'closed' && closure ? own.filter(function (item) { return item.id === closure.run_id; })[0] || null : latest;
  const freshness = supporting ? verify.runnerFreshness(supporting, { repo: repo, verifier: record.verifier_id }) : { ok: false, reason: 'no supporting run' };
  if (!freshness.ok) {
    staleVerdictEscapes += 1;
    blockers.push(record.id + ': ' + status.status + ' but the supporting run is not fresh - ' + freshness.reason);
  }
}
if (blockers.length) {
  process.stderr.write('MECHANISM_PREFLIGHT_BLOCK\n' + blockers.join('\n') + '\n');
  process.exit(2);
}
process.stdout.write('mechanism preflight passed: ' + records.length + ' mechanism(s) verified/closed, stale_verdict_escape_count=' + staleVerdictEscapes + '\n');
