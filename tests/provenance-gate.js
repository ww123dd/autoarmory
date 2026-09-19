'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const decisionScan = require('../src/lib/decision-scan');
function must(condition, message) { if (!condition) throw new Error(message); }
function sha(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
const repo = path.resolve(__dirname, '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-provenance-gate-'));
const state = path.join(root, 'state');
fs.mkdirSync(state, { recursive: true });
const target = path.join(root, 'artifact.bin');
fs.writeFileSync(target, 'approved', 'utf8');
const draft = {
  change_id: 'change-prov',
  owner: 'owner-a',
  expected_transition: 'TRUNCATED->ENUMERATED',
  artifact_type: 'repo-enumeration',
  claim_instance: { root: 'examples/adapters', pattern: 'bridge\\.js$', expected_count: 12 },
  expected_provenance: 'baseline_manifest',
  baseline_id: 'baseline-prov',
  action_class: 'load',
  scope: { repo: 'autoarmory' }
};
const manifest = { schema_version: 'autoarmory/baseline-manifest/v1', entries: { 'baseline-prov': { id: 'baseline-prov', kind: 'file-sha256', ref: target, sha256: sha(target), source: 'owner_approval', owner: 'owner-a', approved_at: '2026-09-19T00:00:00Z', evidence_ref: 'approval-prov' } } };
fs.writeFileSync(path.join(state, 'baseline-manifest.json'), JSON.stringify(manifest) + '\n', 'utf8');
let classified = decisionScan.scanDrafts([draft], { stateDir: state, repo: repo })[0];
must(classified.disposition === 'ready_for_verifier' && classified.provenance_validation && classified.provenance_validation.ok === true, 'valid baseline manifest must pass physical provenance validation');
fs.rmSync(path.join(state, 'baseline-manifest.json'), { force: true });
classified = decisionScan.scanDrafts([draft], { stateDir: state, repo: repo })[0];
must(classified.reason_codes.indexOf('blocked_by_expected_provenance') !== -1, 'missing baseline manifest must fail closed');
manifest.entries['baseline-prov'].sha256 = 'deadbeef';
fs.writeFileSync(path.join(state, 'baseline-manifest.json'), JSON.stringify(manifest) + '\n', 'utf8');
classified = decisionScan.scanDrafts([draft], { stateDir: state, repo: repo })[0];
must(classified.reason_codes.indexOf('blocked_by_expected_provenance') !== -1, 'baseline hash mismatch must fail closed');
console.log('provenance gate tests passed: baseline manifest/file/hash must be physically valid before ready');