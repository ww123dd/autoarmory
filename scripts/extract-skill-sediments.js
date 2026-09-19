#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { parseArgs, printJson, writeJsonl } = require('../src/lib/util');
const sediment = require('../src/lib/sediment-extractor');
function fail(message) { process.stderr.write(message + '\n'); process.exit(2); }
const args = parseArgs(process.argv.slice(2));
if (!args.session) fail('--session <session.jsonl> is required');
if (!args.summons) fail('--summons <autoarmory-summons.jsonl> is required');
if (!args.out) fail('--out <skill-sediment-candidates.jsonl> is required');
(async function () {
  const summons = fs.readFileSync(path.resolve(args.summons), 'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const rows = await sediment.extractSession(path.resolve(args.session), summons);
  writeJsonl(path.resolve(args.out), rows);
  if (args.json) printJson({ schema_version: 'autoarmory/skill-sediment-extraction/v1', count: rows.length, rows: rows });
  else process.stdout.write('skill sediments=' + rows.length + '\n');
})();