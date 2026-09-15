'use strict';

const fs = require('fs');
const path = require('path');
const { parseArgs, printJson, sha256File, writeJson } = require('../lib/util');

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(function (line, index) {
    try { return JSON.parse(line); }
    catch (err) { throw new Error('Invalid JSONL at line ' + (index + 1) + ': ' + err.message); }
  });
}

function observationValid(value) {
  return value && Number.isInteger(value.pass) && Number.isInteger(value.total) && value.total > 0 && value.pass >= 0 && value.pass <= value.total;
}

function verdictFor(item) {
  if (item.kind === 'deterministic') {
    if (!Number.isInteger(item.count_before) || !Number.isInteger(item.count_after)) return 'unknown';
    if (item.count_after === 0 && item.count_before > 0) return 'COUNT->0';
    if (item.count_after > item.count_before) return 'regressed';
    return 'flat';
  }
  if (!observationValid(item.before) || !observationValid(item.after)) return 'unknown';
  if (item.before.pass < item.before.total && item.after.pass === item.after.total) return 'FAIL->PASS';
  if (item.after.pass < item.before.pass || item.after.pass < item.after.total) return 'regressed';
  return 'flat';
}

function validateEnvelope(item, index) {
  const errors = [];
  if (!item || typeof item !== 'object') return ['envelope[' + index + '] must be an object'];
  if (item.schema_version !== 'skillcanary/evidence/v1') errors.push('envelope[' + index + '].schema_version must be skillcanary/evidence/v1');
  for (const key of ['run_id', 'skill', 'kind', 'observed_at']) {
    if (typeof item[key] !== 'string' || item[key].trim() === '') errors.push('envelope[' + index + '].' + key + ' is required');
  }
  if (item.kind !== 'case' && item.kind !== 'deterministic') errors.push('envelope[' + index + '].kind must be case|deterministic');
  return errors;
}

function build(items) {
  const runs = new Map();
  const scores = [];
  for (const item of items) {
    if (!runs.has(item.run_id)) {
      runs.set(item.run_id, {
        schema_version: 'skillcanary/eval-run/v1',
        run_id: item.run_id,
        skill: item.skill,
        skill_hash: item.skill_hash || 'unknown',
        engine: item.engine || 'unknown',
        model: item.model || 'unknown',
        started_at: item.observed_at,
        finished_at: item.observed_at,
        evidence_count: 0,
        verification: {}
      });
    }
    const run = runs.get(item.run_id);
    run.evidence_count += 1;
    if (item.verification) run.verification[item.case_id || item.check || 'run'] = item.verification.result || 'unknown';

    const score = {
      schema_version: 'skillcanary/eval-case-score/v1',
      run_id: item.run_id,
      case_id: item.kind === 'deterministic' ? (item.case_id || item.check || 'check') : (item.case_id || 'unknown'),
      kind: item.kind,
      verdict: verdictFor(item),
      evidence_ref: 'evidence.jsonl#' + item.run_id
    };
    if (item.kind === 'case') {
      score.before = item.before;
      score.after = item.after;
    } else {
      score.before = { count: item.count_before };
      score.after = { count: item.count_after };
      score.check = item.check || item.case_id || 'check';
    }
    scores.push(score);
  }
  return { runs: Array.from(runs.values()), scores };
}

function writeJsonl(file, items) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, items.map(function (item) { return JSON.stringify(item); }).join('\n') + (items.length ? '\n' : ''), 'utf8');
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function exportSql(runs, scores) {
  const lines = [
    'CREATE TABLE IF NOT EXISTS eval_run (',
    '  run_id VARCHAR(128) PRIMARY KEY,',
    '  skill VARCHAR(255) NOT NULL,',
    '  skill_hash VARCHAR(128) NOT NULL,',
    '  engine VARCHAR(64),',
    '  model VARCHAR(128),',
    '  started_at VARCHAR(64) NOT NULL,',
    '  finished_at VARCHAR(64),',
    '  evidence_count INTEGER NOT NULL DEFAULT 0',
    ');',
    '',
    'CREATE TABLE IF NOT EXISTS eval_case_score (',
    '  run_id VARCHAR(128) NOT NULL,',
    '  case_id VARCHAR(255) NOT NULL,',
    '  kind VARCHAR(32) NOT NULL,',
    '  verdict VARCHAR(32) NOT NULL,',
    '  before_json TEXT,',
    '  after_json TEXT,',
    '  evidence_ref VARCHAR(512),',
    '  PRIMARY KEY (run_id, case_id, kind)',
    ');',
    ''
  ];
  for (const run of runs) {
    lines.push('INSERT INTO eval_run (run_id, skill, skill_hash, engine, model, started_at, finished_at, evidence_count) VALUES (' + [
      sqlLiteral(run.run_id), sqlLiteral(run.skill), sqlLiteral(run.skill_hash), sqlLiteral(run.engine), sqlLiteral(run.model),
      sqlLiteral(run.started_at), sqlLiteral(run.finished_at), sqlLiteral(run.evidence_count)
    ].join(', ') + ');');
  }
  for (const score of scores) {
    lines.push('INSERT INTO eval_case_score (run_id, case_id, kind, verdict, before_json, after_json, evidence_ref) VALUES (' + [
      sqlLiteral(score.run_id), sqlLiteral(score.case_id), sqlLiteral(score.kind), sqlLiteral(score.verdict),
      sqlLiteral(JSON.stringify(score.before || {})), sqlLiteral(JSON.stringify(score.after || {})), sqlLiteral(score.evidence_ref || '')
    ].join(', ') + ');');
  }
  return lines.join('\n') + '\n';
}
module.exports = function run(argv) {
  const args = parseArgs(argv);
  const sub = args._[0];
  const source = path.resolve(args.input || '.skillcanary/evidence.jsonl');
  const storeDir = path.resolve(args.dir || '.skillcanary/store');

  if (sub === 'index') {
    if (!fs.existsSync(source)) {
      process.stderr.write('evidence log not found: ' + source + '\n');
      return 1;
    }
    const items = readJsonl(source);
    if (items.length === 0) {
      process.stderr.write('evidence log is empty: ' + source + '\n');
      return 1;
    }
    const errors = [];
    items.forEach(function (item, index) { errors.push.apply(errors, validateEnvelope(item, index)); });
    if (errors.length) {
      for (const error of errors) process.stderr.write('x ' + error + '\n');
      return 1;
    }
    const built = build(items);
    writeJsonl(path.join(storeDir, 'eval-runs.jsonl'), built.runs);
    writeJsonl(path.join(storeDir, 'eval-case-scores.jsonl'), built.scores);
    writeJson(path.join(storeDir, 'store-manifest.json'), {
      schema_version: 'skillcanary/store/v1',
      source: source,
      source_sha256: sha256File(source),
      indexed_at: new Date().toISOString(),
      runs: built.runs.length,
      case_scores: built.scores.length
    });
    process.stdout.write('Indexed ' + items.length + ' evidence record(s) -> ' + storeDir + '\n');
    process.stdout.write('  eval-runs: ' + built.runs.length + ' | eval-case-scores: ' + built.scores.length + '\n');
    return 0;
  }

  if (sub === 'query') {
    if (!fs.existsSync(path.join(storeDir, 'eval-runs.jsonl')) || !fs.existsSync(path.join(storeDir, 'eval-case-scores.jsonl'))) {
      process.stderr.write('store is not indexed yet: run skillcanary store index first\n');
      return 1;
    }
    const scores = readJsonl(path.join(storeDir, 'eval-case-scores.jsonl'));
    const runs = readJsonl(path.join(storeDir, 'eval-runs.jsonl'));
    const runById = new Map(runs.map(function (run) { return [run.run_id, run]; }));
    const filtered = scores.filter(function (score) {
      const run = runById.get(score.run_id) || {};
      if (args.run && score.run_id !== args.run) return false;
      if (args.skill && run.skill !== args.skill) return false;
      if (args.case && score.case_id !== args.case) return false;
      if (args.kind && score.kind !== args.kind) return false;
      if (args.verdict && score.verdict !== args.verdict) return false;
      return true;
    }).map(function (score) {
      return Object.assign({}, score, { skill: (runById.get(score.run_id) || {}).skill });
    });
    if (args.json) printJson(filtered);
    else {
      process.stdout.write('SkillCanary store query @ ' + storeDir + '\n');
      for (const score of filtered) {
        process.stdout.write('  ' + score.run_id + '  ' + (score.skill || '?') + '  ' + score.case_id + '  ' + score.kind + '  ' + score.verdict + '\n');
      }
      process.stdout.write('  Total: ' + filtered.length + '\n');
    }
    return 0;
  }

  if (sub === 'export-sql') {
    const runsFile = path.join(storeDir, 'eval-runs.jsonl');
    const scoresFile = path.join(storeDir, 'eval-case-scores.jsonl');
    if (!fs.existsSync(runsFile) || !fs.existsSync(scoresFile)) {
      process.stderr.write('store is not indexed yet: run skillcanary store index first\n');
      return 1;
    }
    const output = path.resolve(args.output || path.join(storeDir, 'store.sql'));
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, exportSql(readJsonl(runsFile), readJsonl(scoresFile)), 'utf8');
    process.stdout.write('Exported SQL store -> ' + output + '\n');
    return 0;
  }
  process.stderr.write('Usage: skillcanary store <index|query|export-sql> [--input evidence.jsonl] [--dir .skillcanary/store] [--skill x] [--case c01] [--run run-id] [--json]\n');
  return 2;
};

module.exports.build = build;
module.exports.verdictFor = verdictFor;
module.exports.exportSql = exportSql;