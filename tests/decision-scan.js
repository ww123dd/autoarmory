'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const decisionScan = require('../src/lib/decision-scan');
const { sha256 } = require('../src/lib/util');

function must(condition, message) { if (!condition) throw new Error(message); }
function write(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value, 'utf8'); }
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-decision-scan-'));
const state = path.join(root, 'state');
const repo = path.join(root, 'repo');
fs.mkdirSync(repo, { recursive: true });
write(path.join(state, 'owners.json'), JSON.stringify({ owners: {} }) + '\n');
write(path.join(repo, 'verifiers.lock.json'), JSON.stringify({ schema_version: 'autoarmory/verifiers-lock/v1', verifiers: [{ id: 'fixture-enumeration', capabilities: { transition_types: ['TRUNCATED->ENUMERATED'], artifact_type: 'repo-enumeration', required_inputs: ['root', 'pattern', 'expected_count'], optional_inputs: ['manifest'], expected_provenance: ['baseline_manifest'], assertion_schema: { ops: ['eq'] }, action_class: ['load'], scope_schema: { required: ['repo'] }, owner: 'repo-owner' } }] }) + '\n');
const enumClaim = { transition: 'TRUNCATED->ENUMERATED', artifact_type: 'repo-enumeration', inputs: { root: 'examples/adapters', pattern: 'bridge\\.js$', expected_count: 12 }, expected_provenance: 'baseline_manifest', action_class: 'load', scope: { repo: 'autoarmory' } };

const classified = decisionScan.scanDrafts([
  { change_id: 'ready', owner: 'team-a', expected_transition: 'TRUNCATED->ENUMERATED', expected_provenance: 'baseline_manifest', claim_shape: enumClaim, signals: ['check_gap'], change_record_ids: ['r1'] },
  { change_id: 'owner-missing', expected_transition: 'TRUNCATED->ENUMERATED', expected_provenance: 'baseline_manifest', claim_shape: enumClaim, signals: ['check_gap'] },
  { change_id: 'access', owner: 'team-a', expected_transition: 'HTTP->HEALTHY', expected_provenance: 'baseline_manifest', access_required: true, claim_shape: { transition: 'HTTP->HEALTHY', artifact_type: 'http-endpoint', inputs: { url: 'https://example.com/health' }, expected_provenance: 'baseline_manifest', action_class: 'load' }, signals: ['check_gap'] },
  { change_id: 'transition', owner: 'team-a', commands: ['node tests/run.js'], changed_files: [], signals: ['check_gap'] },
  { change_id: 'no-capability', owner: 'team-a', expected_transition: 'FOO->BAR', expected_provenance: 'baseline_manifest', claim_shape: { transition: 'FOO->BAR', artifact_type: 'unknown', inputs: {}, expected_provenance: 'baseline_manifest', action_class: 'load' }, signals: ['check_gap'] }
], { stateDir: state, repo: repo });
must(classified[0].disposition === 'ready_for_verifier', 'capability match + owner + transition + provenance must be ready, got ' + JSON.stringify(classified[0]));
must(classified[1].reason_codes.indexOf('blocked_by_owner') !== -1, 'missing owner must block by owner');
must(classified[2].disposition === 'blocked' && classified[2].reason_codes.indexOf('blocked_by_access') !== -1, 'access-required claim must block by access');
must(classified[3].reason_codes.indexOf('expected_transition_missing') !== -1, 'missing transition must stay explicit');
must(classified[4].disposition === 'no_capability' && classified[4].reason_codes.indexOf('no_capability') !== -1, 'unknown transition must be no_capability, not not_a_case');

const empty = decisionScan.scan(path.join(root, 'empty'), { repo: repo, apply: true });
must(empty.insufficient_real_stream === true && empty.draft_count === 0, 'empty stream must not invent drafts');
must(!fs.existsSync(path.join(root, 'empty', 'decision-scan')), 'insufficient stream must not write a nomination projection');

write(path.join(state, 'change-inspector', 'change-records.jsonl'), JSON.stringify({ id: 'r1', session_id: 's1', turn_id: 't1', signal: 'risk_signal', source: { event_id: 'm1', line: 1 }, detail: { command: 'node tests/run.js', file_paths: ['a.js'] } }) + '\n');
const report = decisionScan.scan(state, { repo: repo, apply: true, limit: 10 });
must(report.candidate_count === 1 && report.draft_count === 1 && report.blocked_by_owner_count === 1 && report.unverifiable_count === 0, 'real change record without owner must produce one blocked_by_owner draft');
must(report.drafts[0].expected_transition === null && report.drafts[0].reason_codes.indexOf('expected_transition_missing') !== -1, 'first pass must not fabricate expected_transition');
must(fs.existsSync(path.join(state, 'decision-scan', 'decision-drafts.jsonl')), 'apply must write the draft projection');
must(!fs.existsSync(path.join(state, 'pending')), 'decision-scan must not activate pending jobs');
const declaredState = path.join(root, 'declared-state');
write(path.join(declaredState, 'change-inspector', 'change-records.jsonl'), JSON.stringify({ id: 'r1', session_id: 's1', turn_id: 't1', signal: 'risk_signal', source: { event_id: 'm1', line: 1 }, detail: { command: 'node tests/run.js', file_paths: ['a.js'] } }) + '\n');
const declaredChangeId = 'change-' + sha256('r1').slice(0, 16);
write(path.join(declaredState, 'owners.json'), JSON.stringify({ owners: {} }) + '\n');
write(path.join(declaredState, 'claims.manifest.json'), JSON.stringify({ claims: { [declaredChangeId]: { expected_transition: 'TRUNCATED->ENUMERATED', artifact_type: 'repo-enumeration', claim_instance: { root: 'examples/adapters', pattern: 'bridge\\.js$', expected_count: 12 }, expected_value: true, expected_provenance: 'baseline_manifest', owner: 'team-a', action_class: 'load', scope: { repo: 'autoarmory' } } } }) + '\n');
const declaredReport = decisionScan.scan(declaredState, { repo: repo, apply: false, limit: 10 });
must(declaredReport.ready_for_verifier_count === 1 && declaredReport.drafts[0].claim_declaration_source === 'claims_manifest', 'trusted claims manifest must make a real change ready without manual verifier selection');
console.log('decision scan tests passed: capability match, no_capability, blocked_by_access/owner, insufficient stream, no activation');