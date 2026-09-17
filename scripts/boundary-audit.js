#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { parseArgs, readJson, readJsonl, printJson } = require('../src/lib/util');
const boundary = require('../src/lib/boundary-policy');
const failureModes = require('../src/lib/failure-modes');

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(__dirname, '..');
const policyPath = path.resolve(args.policy || path.join(root, 'examples', 'boundary-policy.json'));
const candidatePath = path.resolve(args.candidates || path.join(args.state || '.selfforge', 'candidates.jsonl'));
const transitionPath = path.resolve(args.transitions || path.join(args.state || '.selfforge', 'transitions.jsonl'));

let policy;
try { policy = boundary.loadPolicy(policyPath); }
catch (error) { process.stderr.write('boundary policy is unreadable: ' + error.message + '\n'); process.exit(2); }
const policyCheck = boundary.validatePolicy(policy);
const candidates = fs.existsSync(candidatePath) ? readJsonl(candidatePath) : [];
const transitions = fs.existsSync(transitionPath) ? readJsonl(transitionPath) : [];
const report = boundary.auditTransitions(candidates, transitions, policy);
report.policy = policyPath;
report.candidates = candidates.length;
report.transitions = transitions.length;
report.unlabeled_rule_count = failureModes.countUnlabeledRules(failureModes.MODES);
report.stop_conditions_missing_count = policyCheck.missing_stop_condition_count;
report.policy_errors = policyCheck.errors;
report.boundary_policy_escape_count = report.authorized_action_without_approval_count + report.action_classification_conflict_count + report.unlabeled_rule_count + report.stop_conditions_missing_count;
report.ok = report.ok && report.boundary_policy_escape_count === 0;
if (args.json) printJson(report);
else {
  process.stdout.write('boundary audit: candidates=' + report.candidates + ' transitions=' + report.transitions + '\n');
  process.stdout.write('  authorized_action_without_approval_count ' + report.authorized_action_without_approval_count + '\n');
  process.stdout.write('  action_classification_conflict_count      ' + report.action_classification_conflict_count + '\n');
  process.stdout.write('  unlabeled_rule_count                     ' + report.unlabeled_rule_count + '\n');
  process.stdout.write('  stop_conditions_missing_count            ' + report.stop_conditions_missing_count + '\n');
  process.stdout.write('  boundary_policy_escape_count             ' + report.boundary_policy_escape_count + '\n');
}
process.exit(args.enforce && !report.ok ? 1 : 0);