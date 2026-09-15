'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { gate } = require('../src/lib/skillcanary');

const root = path.resolve(__dirname, '..');
const skillcanaryRoot = process.env.SKILLCANARY_HOME || path.resolve(root, '..', '20260914_SkillCanary');
const skillcanaryCli = path.join(skillcanaryRoot, 'bin', 'skillcanary.js');
const skillcanaryPackage = path.join(skillcanaryRoot, 'package.json');

function must(condition, message) {
  if (!condition) {
    console.error('FAIL: ' + message);
    process.exit(1);
  }
}

must(fs.existsSync(skillcanaryCli), 'SkillCanary CLI not found at ' + skillcanaryCli);
const expectedVersion = JSON.parse(fs.readFileSync(skillcanaryPackage, 'utf8')).version;

function candidate(id, overrides) {
  const base = {
    schema_version: 'selfforge/candidate/v1',
    id: id,
    incident_id: 'inc-' + id,
    action: 'fix_reference',
    target: { kind: 'deterministic', id: 'dead-pointer-check', check: 'selfcheck' },
    expected_transition: 'COUNT->0',
    prediction: { fix: ['dead-pointer-check'], regress_risk: ['lint'] },
    evidence: ['observed dead pointer'],
    risk: 'low',
    status: 'candidate',
    change: {
      skill: 'example-skill',
      reason: 'The deterministic selfcheck found a dead reference that must be removed.',
      decision: 'Verify the deterministic selfcheck count drops to zero without a new regression.',
      production_change: false,
      budget: { repeat: 3, max_runs: 9 },
      evidence: { kind: 'deterministic', check: 'selfcheck', count_before: 2, count_after: 0, evidence: 'selfcheck: 2 -> 0' }
    }
  };
  return Object.assign({}, base, overrides || {});
}

let result = gate(candidate('cand-conformance-valid'), { path: skillcanaryRoot, cwd: root, baseDir: root });
must(result.ok === true && result.command === 'gate', 'valid deterministic candidate must pass through SkillCanary gate');
must(result.version === expectedVersion, 'gate result must report the actual SkillCanary version');

result = gate(candidate('cand-conformance-provenance'), { path: skillcanaryRoot, cwd: root, baseDir: root, requireProvenance: true });
must(result.ok === false && result.errors.some(function (item) { return /provenance/.test(item); }), '--require-provenance must be forwarded to SkillCanary');
const invalid = candidate('cand-conformance-invalid');
invalid.change = Object.assign({}, invalid.change, { reason: 'short', decision: 'short' });
result = gate(invalid, { path: skillcanaryRoot, cwd: root, baseDir: root });
must(result.ok === false && result.errors.some(function (item) { return /reason must/.test(item); }), 'invalid reason must be rejected by SkillCanary');

const caseCandidate = candidate('cand-conformance-case', {
  action: 'add_case',
  target: { kind: 'case', id: 'c01' },
  expected_transition: 'FAIL->PASS',
  prediction: { fix: ['c01'], regress_risk: ['c02'] }
});
caseCandidate.change = {
  skill: 'basic-skill',
  reason: 'The basic fixture was not discovered before the change was applied.',
  decision: 'The fixture must be discovered and remain stable across repeated runs.',
  production_change: false,
  budget: { repeat: 3, max_runs: 9 },
  evidence: { kind: 'case', before: { pass: 0, total: 3 }, after: { pass: 3, total: 3 } }
};
result = gate(caseCandidate, {
  path: skillcanaryRoot,
  cwd: root,
  baseDir: root,
  cases: path.join(skillcanaryRoot, 'examples', 'cases.json')
});
must(result.ok === true, 'case candidate with cases.json must pass through SkillCanary gate');

result = gate(candidate('cand-conformance-missing'), { path: path.join(os.tmpdir(), 'missing-skillcanary-' + Date.now()), cwd: root, baseDir: root });
must(result.ok === false && /SkillCanary CLI not found/.test(result.errors.join(' ')), 'missing SkillCanary must fail closed');

console.log('SelfForge SkillCanary conformance passed: ' + expectedVersion);
