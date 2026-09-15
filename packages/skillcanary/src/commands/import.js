'use strict';

const fs = require('fs');
const path = require('path');
const { parseArgs, readJson, writeJson } = require('../lib/util');
const adapters = require('../lib/adapters');

function extract(runner, data, caseId) {
  return adapters.extract(runner, data, caseId);
}

module.exports = function run(argv) {
  const args = parseArgs(argv);
  const runner = args._[0];
  const input = args._[1];
  const caseId = args.case || 'c01';
  if (!runner || !input) {
    process.stderr.write('Usage: skillcanary import <skillgrade|agent-skills-eval|promptfoo|auto> <result.json> [--case c01] [--output change.json]\n');
    return 2;
  }
  if (['skillgrade', 'agent-skills-eval', 'promptfoo', 'auto'].indexOf(runner) === -1) {
    process.stderr.write('Unsupported runner: ' + runner + '\n');
    return 2;
  }

  const data = readJson(path.resolve(input));
  const imported = extract(runner, data, caseId);
  if (!imported) {
    process.stderr.write('Could not extract before/after evidence for runner=' + runner + '. See docs/integrations/ for supported shapes.\n');
    return 1;
  }

  const total = imported.after.total;
  const change = {
    schema_version: 'skillcanary/change/v1',
    id: args.id || 'import-' + imported.runner + '-' + caseId,
    skill: args.skill || 'unknown-skill',
    target: { kind: 'case', id: caseId },
    expected_transition: 'FAIL->PASS',
    reason: args.reason || 'Imported from ' + imported.runner + ' results.',
    decision: args.decision || 'The imported evidence must show a stable FAIL->PASS transition.',
    production_change: true,
    prediction: { fix: [caseId], regress_risk: [args['regress-risk'] || 'regression'] },
    budget: { repeat: Math.max(3, total), max_runs: Math.max(3, total) },
    evidence: { kind: 'case', before: imported.before, after: imported.after }
  };
  const out = path.resolve(args.output || 'change.json');
  if (fs.existsSync(out) && !args.force) {
    process.stderr.write('Output exists: ' + out + ' (use --force to overwrite)\n');
    return 1;
  }
  writeJson(out, change);
  process.stdout.write('Wrote ' + out + ' [' + imported.runner + ']: ' + imported.before.pass + '/' + imported.before.total + ' -> ' + imported.after.pass + '/' + imported.after.total + '\n');
  return 0;
};

module.exports.extract = extract;