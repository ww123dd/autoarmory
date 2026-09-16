#!/usr/bin/env node
'use strict';

// Candidate lifecycle actions, mirroring scripts/mechanism-lifecycle.js.
//
// usage: node scripts/candidate-lifecycle.js --list [--state .selfforge] [--repo .] [--json]
//        node scripts/candidate-lifecycle.js --rollback-if-stale [--actor codex] [--state .selfforge] [--repo .] [--json]

const fs = require('fs');
const path = require('path');
const { parseArgs, printJson } = require('../src/lib/util');
const lifecycle = require('../src/lib/candidate-lifecycle');

const args = parseArgs(process.argv.slice(2));
const repo = path.resolve(args.repo || '.');
const stateDir = path.resolve(args.state || path.join(repo, '.selfforge'));
const options = { repo: repo, actor: args.actor || 'codex' };
const transitions = path.join(stateDir, 'transitions.jsonl');

if (!fs.existsSync(transitions)) {
  if (args.json) printJson({ schema_version: 'autoarmory/candidate-lifecycle/v1', ok: true, action: 'none', reason: 'no candidate state in ' + stateDir, stale_candidate_escape_count: 0, uncovered_candidate_evidence: 0 });
  else process.stdout.write('candidate lifecycle: no candidate state in ' + stateDir + '\n');
  process.exit(0);
}

const records = fs.readFileSync(transitions, 'utf8').split(/\r?\n/).filter(Boolean).map(function (line) { return JSON.parse(line); });

if (args['rollback-if-stale']) {
  const result = lifecycle.rollbackStale(stateDir, options);
  if (args.json) printJson(Object.assign({ schema_version: 'autoarmory/candidate-lifecycle/v1', ok: true, action: 'rollback-if-stale' }, result));
  else process.stdout.write('candidate rollback: rolled_back=' + result.rolled_back + ' escapes_before=' + result.escapes_before + ' escapes_after=' + result.escapes_after + ' uncovered=' + result.uncovered + '\n');
  process.exit(0);
}

const report = lifecycle.staleEscapes(records, options);
const current = Array.from(new Set(records.map(function (item) { return item.candidate_id; }))).map(function (candidateId) {
  const promoting = records.filter(function (item) { return item.candidate_id === candidateId && item.to === 'promoted'; }).pop() || null;
  const freshness = promoting ? lifecycle.artifactFreshness(promoting.evidence, options) : null;
  return { candidate_id: candidateId, state: require('../src/lib/state').currentState(records, candidateId, 'candidate'), evidence_covered: freshness ? freshness.covered : 0, evidence_uncovered: freshness ? freshness.uncovered : 0, evidence_ok: freshness ? freshness.ok : null };
});
if (args.json) printJson({ schema_version: 'autoarmory/candidate-lifecycle/v1', ok: true, action: 'list', stale_candidate_escape_count: report.escapes, uncovered_candidate_evidence: report.uncovered, candidates: current });
else {
  process.stdout.write('candidate lifecycle in ' + stateDir + '\n');
  for (const row of current) process.stdout.write('  ' + String(row.state).padEnd(10) + row.candidate_id + '  evidence_covered=' + row.evidence_covered + ' uncovered=' + row.evidence_uncovered + ' ok=' + row.evidence_ok + '\n');
  process.stdout.write('  stale_candidate_escape_count=' + report.escapes + ' uncovered_candidate_evidence=' + report.uncovered + '\n');
}