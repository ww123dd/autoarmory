'use strict';

const fs = require('fs');
const path = require('path');
const { parseArgs } = require('../lib/util');
const lint = require('./lint');
const gate = require('./gate');
const anchor = require('./anchor');
const mcpOnboard = require('./mcp-onboard');

function safeReadJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function section(title, errors, warnings, info) {
  const lines = ['## ' + title, ''];
  if (!errors.length && !warnings.length && !info.length) lines.push('- OK');
  for (const item of info || []) lines.push('- i ' + item);
  for (const item of warnings || []) lines.push('- ! ' + item);
  for (const item of errors || []) lines.push('- x ' + item);
  lines.push('');
  return lines.join('\n');
}

function build(skillDir) {
  const lines = [];
  const errors = [];
  const warnings = [];

  const lintResult = lint.lint(skillDir);
  errors.push.apply(errors, lintResult.errors);
  warnings.push.apply(warnings, lintResult.warnings);
  lines.push(section('Lint', lintResult.errors, lintResult.warnings, lintResult.info));

  const lockFile = path.join(skillDir, 'skillcanary.lock.json');
  if (fs.existsSync(lockFile)) {
    const current = anchor.computeLock(skillDir);
    const locked = safeReadJson(lockFile);
    const drift = anchor.compare(current, locked);
    if (drift.length) {
      errors.push('anchor drift: ' + drift.join(', '));
      lines.push(section('Anchor', drift, [], ['folder_hash: ' + current.folder_hash]));
    } else {
      lines.push(section('Anchor', [], [], ['folder_hash: ' + current.folder_hash]));
    }
  } else {
    errors.push('skillcanary.lock.json not found');
    lines.push(section('Anchor', ['skillcanary.lock.json not found'], [], []));
  }

  const changeFile = path.join(skillDir, '.skillcanary', 'change.json');
  const casesFile = path.join(skillDir, '.skillcanary', 'cases.json');
  if (fs.existsSync(changeFile)) {
    const change = safeReadJson(changeFile);
    const cases = fs.existsSync(casesFile) ? safeReadJson(casesFile) : null;
    const result = gate.check(change, cases);
    errors.push.apply(errors, result.errors);
    warnings.push.apply(warnings, result.warnings);
    lines.push(section('Change Gate', result.errors, result.warnings, []));
  } else {
    lines.push(section('Change Gate', [], [], ['not configured; skipped']));
  }

  const mcpFile = path.join(skillDir, '.skillcanary', 'mcp.json');
  if (fs.existsSync(mcpFile)) {
    const result = mcpOnboard.check(safeReadJson(mcpFile));
    errors.push.apply(errors, result.errors);
    warnings.push.apply(warnings, result.warnings);
    lines.push(section('MCP Onboarding', result.errors, result.warnings, []));
  } else {
    lines.push(section('MCP Onboarding', [], [], ['not configured; skipped']));
  }

  const verdict = errors.length ? 'FAIL' : (warnings.length ? 'WARN' : 'PASS');
  const header = [
    '# SkillCanary Report',
    '',
    '- Skill: `' + path.resolve(skillDir) + '`',
    '- Generated: ' + new Date().toISOString(),
    '- Result: **' + verdict + '**',
    '- Errors: ' + errors.length,
    '- Warnings: ' + warnings.length,
    ''
  ].join('\n');

  return {
    skillDir: path.resolve(skillDir),
    generated_at: new Date().toISOString(),
    verdict,
    errors,
    warnings,
    markdown: header + '\n' + lines.join('\n')
  };
}

module.exports = function run(argv) {
  const args = parseArgs(argv);
  const skillDir = args._[0];
  if (!skillDir) {
    process.stderr.write('Usage: skillcanary report <skill-dir> [--output report.md]\n');
    return 2;
  }
  const result = build(skillDir);
  if (args.output) {
    fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true });
    fs.writeFileSync(path.resolve(args.output), result.markdown, 'utf8');
  } else {
    process.stdout.write(result.markdown);
  }
  return result.errors.length ? 1 : 0;
};

module.exports.build = build;