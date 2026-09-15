'use strict';

const fs = require('fs');
const path = require('path');
const { parseArgs } = require('../lib/util');
const lint = require('./lint');
const gate = require('./gate');
const anchor = require('./anchor');
const mcpOnboard = require('./mcp-onboard');

module.exports = function run(argv) {
  const args = parseArgs(argv);
  const skillDir = path.resolve(args._[0] || '.');
  let failed = false;

  function runStep(label, fn, stepArgs) {
    process.stdout.write('\n== ' + label + ' ==\n');
    const code = fn(stepArgs);
    if (code !== 0) failed = true;
  }

  runStep('lint', lint, [skillDir]);

  const lockFile = path.join(skillDir, 'skillcanary.lock.json');
  if (fs.existsSync(lockFile)) runStep('anchor --check', anchor, [skillDir, '--check']);
  else { process.stdout.write('\n== anchor --check ==\n  x skillcanary.lock.json not found; run: skillcanary anchor ' + skillDir + '\n'); failed = true; }

  const changeFile = path.join(skillDir, '.skillcanary', 'change.json');
  const casesFile = path.join(skillDir, '.skillcanary', 'cases.json');
  if (fs.existsSync(changeFile)) runStep('gate', gate, fs.existsSync(casesFile) ? [changeFile, casesFile] : [changeFile]);
  else process.stdout.write('\n== gate ==\n  ! .skillcanary/change.json not found; skipped\n');

  const mcpFile = path.join(skillDir, '.skillcanary', 'mcp.json');
  if (fs.existsSync(mcpFile)) runStep('mcp-onboard', mcpOnboard, [mcpFile]);
  else process.stdout.write('\n== mcp-onboard ==\n  ! .skillcanary/mcp.json not found; skipped\n');

  return failed ? 1 : 0;
};