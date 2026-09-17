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
const result = gate(input, { state: args.state ? path.resolve(args.state) : null });
if (args.json) printJson(result); else process.stdout.write(result.decision + ' ' + result.reason + '\n');
process.exit(result.ok ? 0 : 2);