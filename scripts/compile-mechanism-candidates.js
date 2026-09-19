#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { parseArgs, printJson, writeJsonl } = require('../src/lib/util');
const compiler = require('../src/lib/mechanism-candidate-compiler');
function fail(message) { process.stderr.write(message + '\n'); process.exit(2); }
const args = parseArgs(process.argv.slice(2));
if (!args.sediments) fail('--sediments <skill-sediment-candidates.jsonl> is required');
if (!args.out) fail('--out <mechanism-candidates.jsonl> is required');
const rows = fs.readFileSync(path.resolve(args.sediments), 'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
const out = compiler.compile(rows);
writeJsonl(path.resolve(args.out), out);
if (args.json) printJson({ schema_version: 'autoarmory/mechanism-candidate-compilation/v1', count: out.length, rows: out });
else process.stdout.write('mechanism candidates=' + out.length + '\n');