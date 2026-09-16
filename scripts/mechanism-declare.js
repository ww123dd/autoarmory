#!/usr/bin/env node
'use strict';

// Declare a mechanism (case + mechanism) mechanically.
//
// Admission and registration have always lived in src/lib/mechanism.js, but only as a
// library: declaring a new mechanism meant hand-writing a node one-liner. The design
// input stays a descriptor (what failure, what trigger, what action, which registered
// verifier); this script does the boilerplate and the validation:
//
//   - the mechanism must name a verifier that the active profile registers;
//   - the case and the mechanism are admitted through the library, not by editing
//     state files by hand;
//   - duplicates are refused by the library, so a re-run is visible, not silent.
//
// usage: node scripts/mechanism-declare.js --descriptor <file.json> [--state .selfforge]
//        [--repo .] [--json]
//
// descriptor: { "case": {...}, "mechanism": {...} }

const fs = require('fs');
const path = require('path');
const { parseArgs, readJson, printJson } = require('../src/lib/util');
const mechanism = require('../src/lib/mechanism');
const verify = require('../src/lib/verify');

function fail(message, json) {
  if (json) printJson({ schema_version: 'autoarmory/mechanism-declare/v1', ok: false, errors: [message] });
  else process.stderr.write(message + '\n');
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
const descriptorPath = args.descriptor;
if (!descriptorPath) fail('--descriptor <file.json> is required', !!args.json);

const repo = path.resolve(args.repo || '.');
const stateDir = path.resolve(args.state || path.join(repo, '.selfforge'));
let descriptor;
try { descriptor = readJson(path.resolve(descriptorPath)); } catch (error) { fail('descriptor is unreadable: ' + error.message, !!args.json); }
if (!descriptor || typeof descriptor !== 'object') fail('descriptor must be an object with case and mechanism', !!args.json);
if (!descriptor.case || !descriptor.mechanism) fail('descriptor must hold both "case" and "mechanism"', !!args.json);

const verifierId = descriptor.mechanism.verifier_id;
if (!verifierId) fail('mechanism.verifier_id is required; a mechanism without a registered verifier cannot be judged', !!args.json);
const registered = verify.listVerifiers(repo);
if (!registered.ok) fail('verifier profile unusable for ' + repo + ': ' + registered.errors.join('; '), !!args.json);
const declared = registered.verifiers.find(function (item) { return item.id === verifierId; }) || null;
if (!declared) fail('mechanism verifier is not registered: ' + verifierId + ' (registered: ' + registered.verifiers.map(function (item) { return item.id; }).join(', ') + ')', !!args.json);

fs.mkdirSync(stateDir, { recursive: true });
const caseResult = mechanism.admitCase(stateDir, descriptor.case);
if (!caseResult.ok) fail('case admission failed: ' + caseResult.errors.join('; '), !!args.json);
const mechanismResult = mechanism.registerMechanism(stateDir, descriptor.mechanism, { repo: repo });
if (!mechanismResult.ok) fail('mechanism registration failed: ' + mechanismResult.errors.join('; '), !!args.json);

const report = {
  schema_version: 'autoarmory/mechanism-declare/v1',
  ok: true,
  state: stateDir,
  repo: repo,
  case: caseResult.case || descriptor.case,
  mechanism: mechanismResult.mechanism || descriptor.mechanism,
  verifier: { id: verifierId, kind: declared.kind, tools: registered.verifiers.length }
};
if (args.json) printJson(report);
else process.stdout.write('declared ' + (report.case && report.case.id) + ' + ' + (report.mechanism && report.mechanism.id) + ' on verifier ' + verifierId + '\n  state ' + stateDir + '\n');