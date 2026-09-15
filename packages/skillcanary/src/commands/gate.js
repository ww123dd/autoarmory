'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { readJson, parseArgs, printJson } = require('../lib/util');

function isNonEmptyString(v) { return typeof v === 'string' && v.trim() !== ''; }
function isInt(v, min) { return Number.isInteger(v) && v >= min; }

function targetOf(change) {
  if (change.target && typeof change.target === 'object') {
    return {
      kind: change.target.kind || 'case',
      id: change.target.id || change.target_case,
      check: change.target.check || change.target.id || change.target_case
    };
  }
  return { kind: 'case', id: change.target_case, check: change.target_case };
}

function caseObservation(side) {
  if (!side || typeof side !== 'object') return null;
  if (!isInt(side.pass, 0) || !isInt(side.total, 1)) return null;
  if (side.pass > side.total) return null;
  return { pass: side.pass, total: side.total };
}

function deterministicEvidence(evidence, target) {
  const errors = [];
  const kind = evidence.kind || 'case';
  if (kind !== 'deterministic') errors.push('evidence.kind must be deterministic for a deterministic target');
  if (!isNonEmptyString(evidence.check)) errors.push('evidence.check missing');
  else if (evidence.check !== target.check) errors.push('evidence.check must match target.check');
  if (!isInt(evidence.count_before, 0)) errors.push('evidence.count_before must be an integer >= 0');
  if (!isInt(evidence.count_after, 0)) errors.push('evidence.count_after must be an integer >= 0');
  if (isInt(evidence.count_before, 0) && isInt(evidence.count_after, 0) && evidence.count_after >= evidence.count_before) {
    errors.push('evidence.count_after must be less than evidence.count_before');
  }
  if (!isNonEmptyString(evidence.evidence)) errors.push('evidence.evidence must describe the actual check output');
  return errors;
}

function verifyProvenance(change, options) {
  const errors = [];
  const p = change.provenance;
  if (!p) return ['missing provenance for --require-provenance'];
  for (const key of ['author', 'reviewer', 'skill_hash_before', 'skill_hash_after']) {
    if (!isNonEmptyString(p[key])) errors.push('provenance.' + key + ' missing');
  }
  if (isNonEmptyString(p.author) && p.author === p.reviewer) errors.push('provenance.author and reviewer must differ');
  if (p.verifier_independent !== true) errors.push('provenance.verifier_independent must be true');
  if (!Array.isArray(p.evidence_refs) || p.evidence_refs.length === 0) {
    errors.push('provenance.evidence_refs must be a non-empty array');
    return errors;
  }
  const baseDir = options && options.baseDir ? options.baseDir : process.cwd();
  for (const ref of p.evidence_refs) {
    if (!ref || !isNonEmptyString(ref.uri) || !isNonEmptyString(ref.sha256)) {
      errors.push('provenance.evidence_refs entries require uri and sha256');
      continue;
    }
    const refPath = path.isAbsolute(ref.uri) ? ref.uri : path.resolve(baseDir, ref.uri);
    if (!fs.existsSync(refPath)) {
      errors.push('evidence ref not found: ' + ref.uri);
      continue;
    }
    const actual = crypto.createHash('sha256').update(fs.readFileSync(refPath)).digest('hex');
    if (actual !== ref.sha256) errors.push('evidence ref hash mismatch: ' + ref.uri);
  }
  return errors;
}

function check(change, cases, options) {
  const errors = [];
  const warnings = [];
  if (change.schema_version !== 'skillcanary/change/v1') {
    errors.push('schema_version must be "skillcanary/change/v1"');
  }
  if (!isNonEmptyString(change.id)) errors.push('missing id');
  if (!isNonEmptyString(change.skill)) errors.push('missing skill');

  const target = targetOf(change);
  if (target.kind !== 'case' && target.kind !== 'deterministic') {
    errors.push('target.kind must be "case" or "deterministic"');
  }
  if (!isNonEmptyString(target.id)) errors.push('missing target.id or target_case');
  if (target.kind === 'deterministic' && !isNonEmptyString(target.check)) {
    errors.push('missing target.check for a deterministic target');
  }

  const expected = target.kind === 'case' ? 'FAIL->PASS' : 'COUNT->0';
  if (change.expected_transition !== expected) {
    errors.push('expected_transition must be "' + expected + '" for target.kind=' + target.kind);
  }

  for (const key of ['reason', 'decision']) {
    if (!isNonEmptyString(change[key]) || change[key].trim().length < 20) {
      errors.push(key + ' must explain the change in at least 20 characters');
    }
  }
  if (typeof change.production_change !== 'boolean') errors.push('production_change must be true/false');

  const prediction = change.prediction || {};
  for (const key of ['fix', 'regress_risk']) {
    if (!Array.isArray(prediction[key]) || prediction[key].length === 0) {
      errors.push('prediction.' + key + ' must be a non-empty array');
    }
  }

  const budget = change.budget || {};
  if (!isInt(budget.repeat, 1)) errors.push('budget.repeat must be a positive integer');
  if (!isInt(budget.max_runs, 1)) errors.push('budget.max_runs must be a positive integer');
  if (isInt(budget.repeat, 1) && budget.repeat < 3) errors.push('budget.repeat must be at least 3');
  if (isInt(budget.repeat, 1) && isInt(budget.max_runs, 1) && budget.max_runs < budget.repeat) {
    errors.push('budget.max_runs must be >= budget.repeat');
  }

  if (target.kind === 'case') {
    if (cases) {
      const list = Array.isArray(cases) ? cases : (Array.isArray(cases.cases) ? cases.cases : []);
      const hit = list.find(function (c) { return c && c.id === target.id; });
      if (!hit) {
        errors.push('target case "' + target.id + '" does not exist in cases');
      } else {
        const status = String(hit.status || '').toLowerCase();
        if (status === 'observation' || status === 'unstable' || hit.status === '观察项' || hit.status === '不稳') {
          errors.push('target case is observation/unstable and cannot be used as a FAIL baseline');
        }
        if (hit.held_out === true) errors.push('target case is held_out and cannot be used as the target of a change');
        if (!isNonEmptyString(hit.criteria)) warnings.push('target case has no criteria');
      }
      const known = new Set(list.map(function (c) { return c && c.id; }));
      for (const id of prediction.fix || []) if (!known.has(id)) warnings.push('prediction.fix references unknown case: ' + id);
      for (const id of prediction.regress_risk || []) if (!known.has(id)) warnings.push('prediction.regress_risk references unknown case: ' + id);
    } else if (options && options.allowNoCases) {
      warnings.push('no cases.json provided; allowed only for drafting');
    } else {
      errors.push('cases.json is required for case targets; use --allow-no-cases only for drafting');
    }
  } else {
    warnings.push('deterministic target: cases.json is not required');
  }

  if (change.evidence) {
    if (target.kind === 'case') {
      const before = caseObservation(change.evidence.before);
      const after = caseObservation(change.evidence.after);
      if (!before || !after) {
        errors.push('case evidence.before/after must contain {pass,total} with valid integers');
      } else {
        if (isInt(budget.repeat, 1) && (before.total < budget.repeat || after.total < budget.repeat)) {
          errors.push('case evidence repeat is below budget.repeat');
        }
        if (before.pass >= before.total) errors.push('case evidence.before is not a failing baseline');
        if (after.pass !== after.total) errors.push('case evidence.after is not a stable PASS');
      }
    } else {
      errors.push.apply(errors, deterministicEvidence(change.evidence, target));
    }
  } else {
    warnings.push('pre-change gate only: add evidence before/after the run');
  }

  if (options && options.requireProvenance) errors.push.apply(errors, verifyProvenance(change, options));
  return { errors, warnings };
}

module.exports = function run(argv) {
  const args = parseArgs(argv);
  const changeFile = args._[0];
  const casesFile = args._[1];
  if (!changeFile) {
    process.stderr.write('Usage: skillcanary gate <change.json> [cases.json] [--allow-no-cases] [--require-provenance]\n');
    return 2;
  }
  const change = readJson(changeFile);
  const cases = casesFile ? readJson(casesFile) : null;
  const result = check(change, cases, { allowNoCases: !!args['allow-no-cases'], requireProvenance: !!args['require-provenance'], baseDir: path.dirname(path.resolve(changeFile)) });
  if (args.json) printJson(result);
  else {
    process.stdout.write('SkillCanary gate @ ' + changeFile + '\n');
    for (const w of result.warnings) process.stdout.write('  ! ' + w + '\n');
    for (const e of result.errors) process.stdout.write('  x ' + e + '\n');
    process.stdout.write('  Result: ' + (result.errors.length ? 'FAIL' : 'PASS') + '\n');
  }
  return result.errors.length ? 1 : 0;
};

module.exports.check = check;