#!/usr/bin/env node
'use strict';

const path = require('path');
const { spawnSync } = require('child_process');
const { parseArgs } = require('../src/lib/util');
const { isValidationCommand } = require('../src/lib/validation-command');

const argv = process.argv.slice(2);
const separator = argv.indexOf('--');
if (separator === -1 || separator === argv.length - 1) {
  process.stderr.write('Usage: node scripts/validation-exec.js [--state .selfforge] [--link-decision id] -- <command> [args...]\n');
  process.exit(2);
}
const args = parseArgs(argv.slice(0, separator));
const command = argv[separator + 1];
const commandArgs = argv.slice(separator + 2);
const commandLine = [command].concat(commandArgs).join(' ');
const shouldRecord = isValidationCommand(commandLine) || /tests?[\\/]/i.test(commandLine);
const result = shouldRecord
  ? spawnSync(process.execPath, [path.join(__dirname, 'exec-record.js'), '--state', args.state || '.selfforge', '--link-decision', args['link-decision'] || '', '--json', '--', command].concat(commandArgs), { encoding: 'buffer', env: process.env, windowsHide: true })
  : spawnSync(command, commandArgs, { encoding: 'buffer', env: process.env, windowsHide: true });
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.status === null ? 124 : result.status);