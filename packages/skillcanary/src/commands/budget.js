'use strict';

const fs = require('fs');
const path = require('path');
const { parseArgs, printJson } = require('../lib/util');

const DEFAULT_BUDGET = {
  window: 20,
  max: {
    user_correction_count: 2,
    rework_turns: 3,
    tool_error_count: 5
  }
};

const CORRECTION = /(不对|不是这样|错了|重新|重做|再来|修正|纠正|还是不行|仍然|failed|wrong|again|not what|redo|retry|fix this)/i;
const ERROR_EVENT = /(tool_error|tool-error|error|failed|failure|exception|timeout)/i;

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(function (line) {
    return JSON.parse(line);
  });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function textOf(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  if (typeof value.content === 'string') return value.content;
  if (Array.isArray(value.content)) return value.content.map(function (part) { return typeof part === 'string' ? part : (part && part.text) || ''; }).join('\n');
  return JSON.stringify(value);
}

function deriveSignals(record) {
  if (record.signals && typeof record.signals === 'object') {
    return {
      user_correction_count: Number(record.signals.user_correction_count || 0),
      rework_turns: Number(record.signals.rework_turns || 0),
      tool_error_count: Number(record.signals.tool_error_count || 0),
      completed: record.signals.completed === true
    };
  }
  const events = Array.isArray(record.events) ? record.events : (Array.isArray(record.messages) ? record.messages : []);
  let corrections = 0;
  let rework = 0;
  let toolErrors = 0;
  for (const event of events) {
    const role = event && (event.role || event.type || event.kind) || '';
    const text = textOf(event);
    if (/^(user|human)$/i.test(String(role)) && CORRECTION.test(text)) corrections += 1;
    if (/^(user|human)$/i.test(String(role)) && /(重新|重做|再来|retry|redo|again)/i.test(text)) rework += 1;
    if (ERROR_EVENT.test(String(role)) || (event && event.error)) toolErrors += 1;
  }
  return { user_correction_count: corrections, rework_turns: rework, tool_error_count: toolErrors, completed: record.completed === true };
}

function normalizeRecord(record, index) {
  return {
    session_id: record.session_id || record.sessionId || record.id || 'session-' + (index + 1),
    skill: record.skill || record.skill_name || 'unknown-skill',
    skill_hash: record.skill_hash || record.skillHash || 'unknown',
    observed_at: record.observed_at || record.observedAt || new Date().toISOString(),
    signals: deriveSignals(record)
  };
}

function loadBudget(file) {
  if (!file) return DEFAULT_BUDGET;
  if (!fs.existsSync(file)) return DEFAULT_BUDGET;
  const value = readJson(file);
  return {
    window: Number(value.window || DEFAULT_BUDGET.window),
    max: Object.assign({}, DEFAULT_BUDGET.max, value.max || {})
  };
}

function summarize(records, budget) {
  const window = Math.max(1, Number(budget.window || DEFAULT_BUDGET.window));
  const groups = new Map();
  for (const record of records) {
    const key = record.skill + '@' + record.skill_hash;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  return Array.from(groups.entries()).map(function (entry) {
    const recent = entry[1].slice(-window);
    const totals = { user_correction_count: 0, rework_turns: 0, tool_error_count: 0 };
    for (const record of recent) {
      for (const key of Object.keys(totals)) totals[key] += Number(record.signals && record.signals[key] || 0);
    }
    const violations = Object.keys(totals).filter(function (key) { return totals[key] > Number(budget.max[key]); });
    return {
      skill: recent[0].skill,
      skill_hash: recent[0].skill_hash,
      window: recent.length,
      totals,
      limits: budget.max,
      violations,
      state: violations.length ? 'over_budget' : 'within_budget'
    };
  }).sort(function (a, b) { return b.violations.length - a.violations.length || a.skill.localeCompare(b.skill); });
}

function appendJsonl(file, records) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, records.map(function (record) { return JSON.stringify(record); }).join('\n') + (records.length ? '\n' : ''), 'utf8');
}

module.exports = function run(argv) {
  const args = parseArgs(argv);
  const sub = args._[0];
  const input = path.resolve(args.input || '.skillcanary/outcomes.jsonl');

  if (sub === 'ingest') {
    const source = path.resolve(args._[1] || args.input || '');
    if (!args._[1]) {
      process.stderr.write('Usage: skillcanary budget ingest <sessions.json> [--output outcomes.jsonl]\n');
      return 2;
    }
    const data = readJson(source);
    const records = Array.isArray(data) ? data : (Array.isArray(data.sessions) ? data.sessions : [data]);
    const normalized = records.map(normalizeRecord);
    const output = path.resolve(args.output || input);
    appendJsonl(output, normalized);
    process.stdout.write('Imported ' + normalized.length + ' session outcome(s) -> ' + output + '\n');
    return 0;
  }

  const records = readJsonl(input);
  const budget = loadBudget(args.config);

  if (sub === 'stats') {
    const result = summarize(records, budget);
    if (args.json) printJson(result);
    else {
      process.stdout.write('SkillCanary error budget @ ' + input + ' (window=' + budget.window + ')\n');
      for (const row of result) {
        process.stdout.write('  ' + row.skill + '  ' + row.state + '  corrections=' + row.totals.user_correction_count + '/' + row.limits.user_correction_count + '  rework=' + row.totals.rework_turns + '/' + row.limits.rework_turns + '  tool_errors=' + row.totals.tool_error_count + '/' + row.limits.tool_error_count + '\n');
      }
      process.stdout.write('  Total groups: ' + result.length + '\n');
    }
    return 0;
  }

  if (sub === 'check') {
    const result = summarize(records, budget);
    const over = result.filter(function (row) { return row.state === 'over_budget'; });
    if (args.json) printJson({ ok: over.length === 0, budget: budget, groups: result });
    else {
      process.stdout.write('SkillCanary error budget check\n');
      for (const row of result) process.stdout.write('  ' + (row.state === 'over_budget' ? 'x ' : 'o ') + row.skill + ' ' + row.violations.join(',') + '\n');
      process.stdout.write('  Result: ' + (over.length ? 'STOP_AND_COLLECT_INCIDENTS' : 'PASS') + '\n');
    }
    return over.length ? 1 : 0;
  }

  process.stderr.write('Usage: skillcanary budget <ingest|stats|check> [--input outcomes.jsonl] [--config budget.json] [--json]\n');
  return 2;
};

module.exports.DEFAULT_BUDGET = DEFAULT_BUDGET;
module.exports.deriveSignals = deriveSignals;
module.exports.summarize = summarize;