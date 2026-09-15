'use strict';

const fs = require('fs');
const path = require('path');
const { parseArgs, printJson } = require('../lib/util');

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch (_) { return ''; }
}

function readInput() {
  const raw = readStdin().trim();
  if (!raw) return {};
  try { return JSON.parse(raw); } catch (_) { return { raw: raw }; }
}

function rulesPath(baseDir) {
  return path.resolve(baseDir || '.', '.skillcanary/hook-rules.json');
}

function loadRules(baseDir) {
  const file = rulesPath(baseDir);
  if (!fs.existsSync(file)) return { rules: [], errors: [], warnings: ['hook-rules.json not found; pre-tool defaults to allow'], file };
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const rules = Array.isArray(data.preTool) ? data.preTool : (Array.isArray(data.rules) ? data.rules : []);
    return { rules, errors: [], warnings: [], file };
  } catch (err) {
    return { rules: [], errors: ['cannot parse hook-rules.json: ' + err.message], warnings: [], file };
  }
}

function ruleMatches(rule, input) {
  if (!rule || typeof rule !== 'object') return false;
  if (rule.enabled === false) return false;
  if (rule.event && rule.event !== 'pre-tool' && rule.event !== 'pre_tool') return false;
  if (rule.host && input.host && rule.host !== input.host) return false;
  if (!rule.pattern) return false;
  try { return new RegExp(rule.pattern, rule.flags || 'i').test(JSON.stringify(input)); }
  catch (_) { return false; }
}

function preTool(input) {
  const rule = loadRules().rules.find(function (item) { return ruleMatches(item, input); });
  return rule
    ? { decision: 'deny', rule: rule.id || 'custom', reason: rule.reason || 'blocked by SkillCanary hook rule' }
    : { decision: 'allow' };
}

function readArmor() {
  const file = path.resolve('.skillcanary/armor.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(function (line) { return JSON.parse(line); });
}

function stopCheck() {
  const change = path.resolve('.skillcanary/change.json');
  const report = path.resolve('skillcanary-report.md');
  if (fs.existsSync(change) && !fs.existsSync(report)) {
    return { continue: true, message: 'SkillCanary: change.json exists but no report. Run skillcanary report/comment before claiming completion.' };
  }
  return { continue: true };
}

function doctor(baseDir) {
  const loaded = loadRules(baseDir);
  const errors = loaded.errors.slice();
  const warnings = loaded.warnings.slice();
  const ids = new Set();
  loaded.rules.forEach(function (rule, index) {
    const label = 'preTool[' + index + ']';
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) { errors.push(label + ' must be an object'); return; }
    if (typeof rule.id !== 'string' || !rule.id.trim()) errors.push(label + '.id is required');
    else if (ids.has(rule.id)) errors.push(label + '.id is duplicated: ' + rule.id);
    else ids.add(rule.id);
    if (typeof rule.reason !== 'string' || !rule.reason.trim()) errors.push(label + '.reason is required');
    if (typeof rule.pattern !== 'string' || !rule.pattern.trim()) errors.push(label + '.pattern is required');
    else {
      try { new RegExp(rule.pattern, rule.flags || 'i'); }
      catch (err) { errors.push(label + '.pattern is invalid: ' + err.message); }
    }
    if (rule.flags && !/^[dgimsuvy]+$/.test(rule.flags)) warnings.push(label + '.flags may be invalid');
  });
  return { file: loaded.file, rules: loaded.rules.length, errors, warnings, ok: errors.length === 0 };
}

module.exports = function run(argv) {
  const args = parseArgs(argv);
  const event = args._[0];
  const input = readInput();

  if (event === 'doctor') {
    const result = doctor();
    if (args.json) printJson(result);
    else {
      process.stdout.write('SkillCanary hook doctor @ ' + result.file + '\n');
      for (const warning of result.warnings) process.stdout.write('  ! ' + warning + '\n');
      for (const error of result.errors) process.stdout.write('  x ' + error + '\n');
      process.stdout.write('  Result: ' + (result.ok ? 'PASS' : 'FAIL') + ' (' + result.rules + ' rule(s))\n');
    }
    return result.ok ? 0 : 1;
  }

  if (event === 'pre-tool') {
    process.stdout.write(JSON.stringify(preTool(input)) + '\n');
    return 0;
  }
  if (event === 'session-start') {
    const active = readArmor().filter(function (item) { return item.status === 'warning' || item.status === 'blocking'; });
    process.stdout.write(JSON.stringify({ continue: true, context: active.length ? 'SkillCanary armor active: ' + active.map(function (item) { return item.id + ':' + item.status; }).join(', ') : '' }) + '\n');
    return 0;
  }
  if (event === 'stop') {
    process.stdout.write(JSON.stringify(stopCheck()) + '\n');
    return 0;
  }
  if (event === 'session-end') {
    const out = path.resolve('.skillcanary/outcomes.jsonl');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const record = {
      session_id: input.session_id || input.sessionId || 'unknown',
      skill: input.skill || 'unknown',
      skill_hash: input.skill_hash || input.skillHash || 'unknown',
      observed_at: new Date().toISOString(),
      signals: input.signals || {}
    };
    fs.appendFileSync(out, JSON.stringify(record) + '\n', 'utf8');
    process.stdout.write(JSON.stringify({ continue: true, recorded: out }) + '\n');
    return 0;
  }

  process.stderr.write('Usage: skillcanary hook <doctor|session-start|pre-tool|stop|session-end>\n');
  return 2;
};

module.exports.doctor = doctor;
module.exports.preTool = preTool;