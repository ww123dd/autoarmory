'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'bin', 'autoarmory.js');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-aliases-'));
const state = path.join(temp, '.selfforge');
const request = path.join(temp, 'request.json');
const outcome = path.join(temp, 'outcome.json');
fs.writeFileSync(request, JSON.stringify({ schema_version: 'autoarmory/routing-request/v1', task_type: 'run-agent-eval', risk: 'medium', data_sensitivity: 'internal', cost_budget: 1, latency_slo_ms: 5000, write_required: false, security_level: 'standard', human_approval: false, context: {} }), 'utf8');
fs.writeFileSync(outcome, JSON.stringify({ schema_version: 'autoarmory/outcome/v1', decision_id: 'route-alias', capability_id: 'runner.skillgrade', task_type: 'run-agent-eval', result: 'success', reward: 1, cost: 0.02, latency_ms: 1000, failure_mode: null, environment_fingerprint: 'test', evidence: {}, verified: true, source: 'integration', propensity: 0.5, observed_at: '2026-09-15T00:00:00.000Z' }), 'utf8');
function run(args) { const r = spawnSync(process.execPath, [cli].concat(args), { cwd: root, encoding: 'utf8' }); return { code: r.status, out: r.stdout || '', err: r.stderr || '' }; }
let result = run(['capability', 'register', path.join(root, 'examples', 'capabilities.jsonl'), '--state', state, '--json']);
if (result.code !== 0) throw new Error(result.err || result.out);
result = run(['route', '--request', request, '--state', state, '--json']);
if (result.code !== 0 || !/"selected"/.test(result.out)) throw new Error('route alias failed: ' + result.out + result.err);
result = run(['outcome', outcome, '--state', state, '--json']);
if (result.code !== 0 || !/"ok": true/.test(result.out)) throw new Error('outcome alias failed: ' + result.out + result.err);
console.log('CLI alias tests passed');