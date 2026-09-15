'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { startServer } = require('../src/lib/api');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-api-'));
const state = path.join(temp, '.selfforge');
fs.mkdirSync(state, { recursive: true });
fs.writeFileSync(path.join(state, 'capabilities.jsonl'), JSON.stringify({
  schema_version: 'autoarmory/capability/v1',
  id: 'runner.api',
  vendor: 'test',
  kind: 'runner',
  version: '1.0.0',
  capabilities: ['run-agent-eval'],
  permissions: { read: true, write: false, network: false },
  cost: { unit: 'usd', estimate: 0.01 },
  latency_ms: { p50: 100, p95: 200 },
  reliability: { alpha: 8, beta: 2 },
  risk: 'low',
  trust_level: 'trusted',
  conformance_level: 'ci-gated',
  health: 'healthy',
  freshness: '2026-09-15T00:00:00.000Z',
  evidence_refs: []
}) + String.fromCharCode(10), 'utf8');

(async function () {
  const server = await startServer({ host: '127.0.0.1', port: 0, state: state });
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    let response = await fetch(base + '/health');
    let json = await response.json();
    if (!json.ok) throw new Error('health');
    response = await fetch(base + '/capabilities');
    json = await response.json();
    if (!json.some(function (item) { return item.id === 'runner.api'; })) throw new Error('capabilities');
    response = await fetch(base + '/route', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ request: { schema_version: 'autoarmory/routing-request/v1', task_type: 'run-agent-eval', risk: 'low', data_sensitivity: 'internal', cost_budget: 1, latency_slo_ms: 1000, write_required: false, security_level: 'standard', human_approval: false, context: {} }, seed: 7 }) });
    json = await response.json();
    if (!json.ok || json.selected[0].id !== 'runner.api') throw new Error('route');
    response = await fetch(base + '/playground');
    const html = await response.text();
    if (!/AutoArmory Playground/.test(html)) throw new Error('playground');
    console.log('API/SDK surface tests passed');
  } finally {
    server.close();
  }
})().catch(function (err) { console.error('FAIL: ' + err.message); process.exit(1); });