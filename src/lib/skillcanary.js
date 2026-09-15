'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { sha256, writeJson } = require('./util');

function cliFor(root) {
  if (!root) return null;
  const cli = path.resolve(root, 'bin', 'skillcanary.js');
  return fs.existsSync(cli) ? cli : null;
}

function resolve(flag, cwd) {
  if (flag) return cliFor(flag);
  if (process.env.SKILLCANARY_HOME) return cliFor(process.env.SKILLCANARY_HOME);
  return cliFor(path.resolve(cwd || '.', '../20260914_SkillCanary'));
}

function run(args, options) {
  const opts = options || {};
  const cli = opts.cli || resolve(opts.path, opts.cwd);
  if (!cli) return { code: 2, out: '', err: 'SkillCanary CLI not found. Set SKILLCANARY_HOME or pass --skillcanary <repo>.', cli: null };
  const result = spawnSync(process.execPath, [cli].concat(args || []), { cwd: opts.cwd || process.cwd(), encoding: 'utf8' });
  return { code: result.status, out: result.stdout || '', err: result.stderr || '', cli };
}

function toChange(candidate, baseDir) {
  const source = (candidate && candidate.change) || {};
  const change = Object.assign({}, source);
  change.schema_version = 'skillcanary/change/v1';
  change.id = source.id || (candidate && candidate.id);
  if (!change.target) change.target = candidate && candidate.target;
  if (!change.expected_transition) change.expected_transition = candidate && candidate.expected_transition;
  if (!change.prediction) change.prediction = candidate && candidate.prediction;
  if (change.provenance && Array.isArray(change.provenance.evidence_refs)) {
    change.provenance = Object.assign({}, change.provenance, {
      evidence_refs: change.provenance.evidence_refs.map(function (ref) {
        if (!ref || typeof ref.uri !== 'string' || path.isAbsolute(ref.uri)) return ref;
        return Object.assign({}, ref, { uri: path.resolve(baseDir || '.', ref.uri) });
      })
    });
  }
  return change;
}

function parseResult(call) {
  let parsed = null;
  if (call.out && call.out.trim()) {
    try { parsed = JSON.parse(call.out); } catch (_) {}
  }
  const errors = parsed && Array.isArray(parsed.errors) ? parsed.errors.slice() : [];
  const warnings = parsed && Array.isArray(parsed.warnings) ? parsed.warnings.slice() : [];
  if (call.code !== 0 && errors.length === 0) errors.push(call.err.trim() || ('SkillCanary gate exited ' + call.code));
  if (call.code === 0 && !parsed) errors.push('SkillCanary gate did not return JSON');
  return { parsed: parsed, errors: errors, warnings: warnings };
}

function gate(candidate, options) {
  const opts = options || {};
  const cli = opts.cli || resolve(opts.path, opts.cwd);
  if (!cli) {
    return {
      schema_version: 'selfforge/skillcanary-gate/v1',
      ok: false,
      command: 'gate',
      cli: null,
      version: null,
      exit_code: 2,
      result: null,
      errors: ['SkillCanary CLI not found. Set SKILLCANARY_HOME or pass --skillcanary <repo>.'],
      warnings: []
    };
  }

  const baseDir = opts.baseDir || (opts.candidateFile ? path.dirname(path.resolve(opts.candidateFile)) : process.cwd());
  const change = toChange(candidate, baseDir);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'selfforge-gate-'));
  try {
    const changeFile = path.join(tempDir, 'change.json');
    writeJson(changeFile, change);
    const args = ['gate', changeFile];
    if (opts.cases) args.push(path.resolve(opts.cases));
    args.push('--json');
    if (opts.requireProvenance) args.push('--require-provenance');
    const call = run(args, { cli: cli, cwd: opts.cwd });
    const parsed = parseResult(call);
    const versionCall = run(['version'], { cli: cli, cwd: opts.cwd });
    return {
      schema_version: 'selfforge/skillcanary-gate/v1',
      ok: call.code === 0 && parsed.errors.length === 0 && !!parsed.parsed,
      command: 'gate',
      cli: cli,
      version: versionCall.code === 0 ? versionCall.out.trim() : null,
      exit_code: call.code,
      change_sha256: sha256(JSON.stringify(change)),
      result: parsed.parsed,
      errors: parsed.errors,
      warnings: parsed.warnings,
      stderr: call.err.trim()
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

module.exports = { resolve, run, toChange, gate };
