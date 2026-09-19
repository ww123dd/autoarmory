'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { orchestrate } = require('../src/lib/decision-orchestrator');

function must(condition, message) { if (!condition) throw new Error(message); }
function write(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value, 'utf8'); }
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-decision-orchestrator-'));
const state = path.join(root, 'state');
const repo = path.join(root, 'repo');
fs.mkdirSync(repo, { recursive: true });
write(path.join(state, 'decision-scan', 'ready-for-verifier.jsonl'), [
  JSON.stringify({ schema_version: 'autoarmory/decision-draft/v1', change_id: 'registered-change', expected_transition: 'FAIL->PASS', expected_provenance: 'pinned_verifier', claim_instance: { verifier: 'fixture-verifier' }, owner: 'team-a', disposition: 'ready_for_verifier', verifier_candidate: { kind: 'registered', ref: 'fixture-verifier' }, session_id: 's1', turn_id: 't1', source_message_id: 'm1' }),
  JSON.stringify({ schema_version: 'autoarmory/decision-draft/v1', change_id: 'project-test-change', expected_transition: 'TEST->PASS', expected_provenance: 'baseline_manifest', claim_instance: { command: 'node tests/run.js' }, owner: 'team-a', disposition: 'ready_for_verifier', verifier_candidate: { kind: 'project_test', ref: 'node tests/run.js' }, changed_files: ['src/a.js'], commands: ['node tests/run.js'], session_id: 's2' })
].join('\n') + '\n');

const dry = orchestrate(state, { repo: repo });
must(dry.ready_count === 2 && dry.written === 2 && !fs.existsSync(path.join(state, 'pending')), 'dry-run must not write pending jobs');
const applied = orchestrate(state, { repo: repo, apply: true });
must(applied.written === 2 && fs.existsSync(path.join(state, 'pending', 'registered-change.json')) && fs.existsSync(path.join(state, 'pending', 'project-test-change.json')), 'apply must write both pending jobs');
const registered = JSON.parse(fs.readFileSync(path.join(state, 'pending', 'registered-change.json'), 'utf8'));
const project = JSON.parse(fs.readFileSync(path.join(state, 'pending', 'project-test-change.json'), 'utf8'));
must(registered.verifier_id === 'fixture-verifier' && registered.session_id === 's1' && registered.source_message_id === 'm1' && registered.expected_provenance === 'pinned_verifier' && registered.claim_instance.verifier === 'fixture-verifier', 'registered pending job must preserve verifier, claim instance and provenance');
must(project.verifier_candidate.kind === 'project_test' && project.mechanical_binding.kind === 'project_test' && project.expected_transition === 'TEST->PASS' && project.expected_provenance === 'baseline_manifest' && project.claim_instance.command === 'node tests/run.js', 'mechanical pending job must carry pinned binding, transition, instance and provenance');
must(!fs.existsSync(path.join(state, 'reuse-records')) && !fs.existsSync(path.join(state, 'closures.jsonl')), 'orchestrator must not run or close');
const again = orchestrate(state, { repo: repo, apply: true });
must(again.written === 0 && again.already_pending === 2, 'second orchestrate must be idempotent');
console.log('decision orchestrator tests passed: ready -> pending only, provenance, pinned binding, idempotent');