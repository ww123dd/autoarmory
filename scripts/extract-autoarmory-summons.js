#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { parseArgs, printJson, writeJsonl } = require('../src/lib/util');
const extractor = require('../src/lib/summon-extractor');
function fail(message) { process.stderr.write(message + '\n'); process.exit(2); }
const args = parseArgs(process.argv.slice(2));
if (!args.session) fail('--session <session.jsonl> is required');
if (!args.out) fail('--out <autoarmory-summons.jsonl> is required');
(async function () {
  const rows = await extractor.extractSession(path.resolve(args.session));
  writeJsonl(path.resolve(args.out), rows);
  if (args.json) printJson({ schema_version: 'autoarmory/summon-extraction/v1', session: path.resolve(args.session), count: rows.length, rows: rows });
  else process.stdout.write('autoarmory summons=' + rows.length + '\n');
})();