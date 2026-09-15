#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = function (file) { return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''; };
const lines = function (file) { return read(file).split(/\r?\n/).filter(Boolean); };
const commandFiles = fs.readdirSync(path.join(root, 'src', 'commands')).filter(function (name) { return name.endsWith('.js'); });
const cli = read(path.join(root, 'src', 'cli.js'));
const topLevel = (cli.match(/const commands = \{([^}]*)\}/) || [])[1] || '';
const topLevelCount = topLevel.split(',').map(function (item) { return item.trim(); }).filter(Boolean).length;
const readmeCommands = lines(path.join(root, 'README.md')).filter(function (line) { return /^autoarmory\s+/.test(line); });
const testFiles = fs.readdirSync(path.join(root, 'tests')).filter(function (name) { return name.endsWith('.js') && name !== 'run.js'; });
const negativeFiles = testFiles.filter(function (name) { return /BLOCK|FAIL|must\(/.test(read(path.join(root, 'tests', name))); });
const incidentFiles = ['.selfforge/incidents-real.jsonl', '.selfforge/incidents.jsonl', 'examples/incidents.jsonl'].map(function (file) { return path.join(root, file); }).filter(function (file) { return fs.existsSync(file); });
const incidents = incidentFiles.reduce(function (sum, file) { return sum + lines(file).length; }, 0);
const hashed = incidentFiles.reduce(function (sum, file) { return sum + lines(file).filter(function (line) { try { const item = JSON.parse(line); return item.input_sha256 && item.output_sha256; } catch (_) { return false; } }).length; }, 0);
const outcomes = fs.existsSync(path.join(root, '.selfforge/capability-outcomes.jsonl')) ? lines(path.join(root, '.selfforge/capability-outcomes.jsonl')).length : 0;
const closures = fs.existsSync(path.join(root, '.selfforge/closures.jsonl')) ? lines(path.join(root, '.selfforge/closures.jsonl')).length : 0;
const report = { command_files: commandFiles.length, top_level_commands: topLevelCount, visible_commands: readmeCommands.length, mechanism_mentions: (read(path.join(root, 'README.md')).match(/mechanism/gi) || []).length, negative_controls: negativeFiles.length, incidents: incidents, hashed_incidents: hashed, outcomes: outcomes, closures: closures };
if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2)); else for (const key of Object.keys(report)) console.log(key + '=' + report[key]);