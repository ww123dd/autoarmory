#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { parseArgs, readJson, printJson } = require('../src/lib/util');
const { contextBudget, budgetEscapes } = require('../src/lib/context-budget');

const args = parseArgs(process.argv.slice(2));
const skill = args.skill;
if (!skill) {
  process.stderr.write('Usage: node scripts/context-budget.js --skill <skill-dir> [--budget budget.json] [--enforce] [--json]\n');
  process.exit(2);
}
const result = contextBudget(skill);
if (!result.ok) {
  if (args.json) printJson(result); else process.stderr.write(result.errors.join('\n') + '\n');
  process.exit(1);
}
const budgetPath = path.resolve(args.budget || path.join(__dirname, '..', 'examples', 'context-budget.json'));
const budget = fs.existsSync(budgetPath) ? readJson(budgetPath) : {};
const escapes = budgetEscapes(result.metrics, budget);
const report = Object.assign({}, result, { budget: budgetPath, context_budget_escape_count: escapes.count, violations: escapes.violations });
if (args.json) printJson(report);
else {
  process.stdout.write('context budget: ' + result.skill_dir + '\n');
  for (const [key, value] of Object.entries(result.metrics)) process.stdout.write('  ' + key.padEnd(28) + value + '\n');
  process.stdout.write('  context_budget_escape_count ' + escapes.count + '\n');
  for (const violation of escapes.violations) process.stdout.write('  ESCAPE ' + violation.metric + '=' + violation.value + ' > ' + violation.limit + '\n');
}
process.exit(args.enforce && escapes.count ? 1 : 0);