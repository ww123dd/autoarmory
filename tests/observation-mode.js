'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { observeClaim } = require('../src/lib/observation');

function must(condition, message) { if (!condition) throw new Error(message); }
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-observation-'));
const state = path.join(root, 'state');
fs.mkdirSync(state, { recursive: true });
const claim = {
  change_id: 'observation-enumeration',
  session_id: 's-observation',
  transition: 'TRUNCATED->ENUMERATED',
  artifact_type: 'repo-enumeration',
  inputs: { root: 'examples/adapters', pattern: 'bridge\\.js$', expected_count: 12 },
  expected_provenance: 'baseline_manifest',
  action_class: 'load',
  scope: { repo: 'autoarmory' }
};
const report = observeClaim(state, claim, { repo: path.resolve(__dirname, '..') });
must(report.status === 'captured' && report.authority === 'none' && report.activates_case === false && report.gate_effect === 'none', 'observation must capture with no authority');
must(report.record.verifier_id === 'enumeration-completeness' && report.record.resolution_source === 'registry_schema_match' && report.record.verifier_binding_source === 'resolver', 'observation must bind verifier through capability resolver');
must(report.record.observed && report.record.observed.complete === true, 'observation must retain observed facts');
must(fs.existsSync(path.join(state, 'observation-records.jsonl')), 'observation record must be written');
must(!fs.existsSync(path.join(state, 'pending')), 'observation must not write pending');
must(!fs.existsSync(path.join(state, 'mechanism-runs.jsonl')), 'observation must not write runs');
must(!fs.existsSync(path.join(state, 'closures.jsonl')), 'observation must not write closures');
must(!fs.existsSync(path.join(state, 'reuse-records')), 'observation must not write reuse records');
console.log('observation mode tests passed: readonly observation, authority=none, no pending/runs/closures/reuse');