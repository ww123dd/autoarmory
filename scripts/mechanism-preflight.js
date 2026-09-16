#!/usr/bin/env node
'use strict';

// Mechanism preflight: if a repository has mechanism state, an unverified,
// expired, or bypassed mechanism blocks the commit. A verdict without a
// consumer is decoration; this is the first real consumer of mechanism status.

const fs = require('fs');
const path = require('path');
const mechanism = require('../src/lib/mechanism');

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
const blockers = [];
for (const record of records) {
  const status = mechanism.status(state, record.id, { repo: repo });
  if (!status.ok || (status.status !== 'verified' && status.status !== 'closed')) {
    blockers.push(record.id + ': ' + (status.status || 'error') + ' - ' + (status.reason || (status.errors || []).join('; ')));
  }
}
if (blockers.length) {
  process.stderr.write('MECHANISM_PREFLIGHT_BLOCK\n' + blockers.join('\n') + '\n');
  process.exit(2);
}
process.stdout.write('mechanism preflight passed: ' + records.length + ' mechanism(s) verified/closed\n');
