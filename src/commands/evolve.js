'use strict';

const path = require('path');
const fs = require('fs');
const { parseArgs, writeJson, writeJsonl, printJson, readJsonl } = require('../lib/util');
const { observe } = require('../lib/observe');
const { propose } = require('../lib/propose');
const { acquire } = require('../lib/acquire');
const { gateCandidate } = require('../lib/gate');
const { fingerprint } = require('../lib/environment');
const { recommend } = require('../lib/policy');

module.exports = function run(argv) {
  const args = parseArgs(argv);
  const input = args._[0] || '.';
  const state = path.resolve(args.state || '.selfforge');
  const decisions = readJsonl(path.join(state, 'decisions.jsonl'));
  const incidents = observe(path.resolve(input), { format: args.format || 'auto' });
  const candidates = acquire(propose(incidents), recommend(decisions, { seed: Number(args.seed || 1) }));
  const gated = candidates.map(function (candidate) {
    const result = gateCandidate(candidate, {
      path: args.skillcanary,
      cwd: process.cwd(),
      cases: args.cases,
      requireProvenance: !!args['require-provenance'],
      baseDir: process.cwd()
    });
    return Object.assign({}, candidate, { gate: result, status: result.ok ? 'gated' : 'rejected' });
  });
  fs.mkdirSync(state, { recursive: true });
  writeJsonl(path.join(state, 'incidents.jsonl'), incidents);
  writeJsonl(path.join(state, 'candidates.jsonl'), gated);
  writeJson(path.join(state, 'environment.json'), fingerprint(process.cwd()));
  const accepted = gated.filter(function (item) { return item.status === 'gated'; });
  const result = {
    schema_version: 'selfforge/evolution/v1',
    input: path.resolve(input),
    incidents: incidents.length,
    candidates: gated.length,
    gated: accepted.length,
    rejected: gated.length - accepted.length,
    next: accepted.slice(0, 5).map(function (item) {
      return { id: item.id, action: item.action, score: item.acquisition_score, risk: item.risk };
    })
  };
  if (args.json) printJson(result);
  else {
    process.stdout.write('SelfForge evolve\n');
    process.stdout.write('  incidents=' + result.incidents + ' candidates=' + result.candidates + ' gated=' + result.gated + ' rejected=' + result.rejected + '\n');
    for (const item of result.next) process.stdout.write('  ' + item.id + '  ' + item.action + '  score=' + item.score.toFixed(2) + '  risk=' + item.risk + '\n');
  }
  return result.rejected ? 1 : 0;
};
