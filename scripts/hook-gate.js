#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { parseArgs, readJson, printJson } = require('../src/lib/util');
const { gate } = require('../src/lib/hook-gate');
const args = parseArgs(process.argv.slice(2));
let input = null;
try {
  if (args.event) input = readJson(path.resolve(args.event));
  else if (!process.stdin.isTTY) input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  else input = {};
} catch (error) {
  process.stderr.write('hook event is unreadable: ' + error.message + '\n');
  process.exit(2);
}
let selectedMechanism = null;
if (args.mechanism) {
  if (!args.state) { process.stderr.write('--state is required with --mechanism\n'); process.exit(2); }
  const file = path.join(path.resolve(args.state), 'mechanisms.jsonl');
  let mechanisms = [];
  try { mechanisms = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(function (line) { return JSON.parse(line); }) : []; }
  catch (error) { process.stderr.write('mechanism state is unreadable: ' + error.message + '\n'); process.exit(2); }
  selectedMechanism = mechanisms.find(function (item) { return item.id === args.mechanism; }) || null;
  if (!selectedMechanism) { process.stderr.write('mechanism not found: ' + args.mechanism + '\n'); process.exit(2); }
}
const result = gate(input, {
  state: args.state ? path.resolve(args.state) : null,
  mechanism: selectedMechanism,
  repo: args.repo ? path.resolve(args.repo) : process.cwd(),
  trials: Number(args.trials || 1)
});
if (args.json) printJson(result); else process.stdout.write(result.decision + ' ' + result.reason + '\n');
process.exit(result.ok ? 0 : 2);
