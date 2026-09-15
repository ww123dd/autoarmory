'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { writeJsonl } = require('./util');
const capability = require('./capability');

function demoCapabilities() {
  return [
    { schema_version: 'autoarmory/capability/v1', id: 'runner.fast', vendor: 'fast-runner', kind: 'runner', version: '1.0.0', capabilities: ['run-agent-eval'], permissions: { read: true, write: false, network: false }, cost: { unit: 'usd', estimate: 0.005 }, latency_ms: { p50: 400, p95: 900 }, reliability: { alpha: 6, beta: 4 }, risk: 'medium', trust_level: 'verified', conformance_level: 'verified', health: 'healthy', freshness: '2026-09-15T00:00:00.000Z', evidence_refs: [] },
    { schema_version: 'autoarmory/capability/v1', id: 'runner.trusted', vendor: 'trusted-runner', kind: 'runner', version: '1.0.0', capabilities: ['run-agent-eval'], permissions: { read: true, write: false, network: false }, cost: { unit: 'usd', estimate: 0.02 }, latency_ms: { p50: 700, p95: 1500 }, reliability: { alpha: 9, beta: 1 }, risk: 'low', trust_level: 'trusted', conformance_level: 'ci-gated', health: 'healthy', freshness: '2026-09-15T00:00:00.000Z', evidence_refs: [] },
    { schema_version: 'autoarmory/capability/v1', id: 'scanner.sarif', vendor: 'sarif-scanner', kind: 'scanner', version: '1.0.0', capabilities: ['scan-skill'], permissions: { read: true, write: false, network: false }, cost: { unit: 'usd', estimate: 0.001 }, latency_ms: { p50: 200, p95: 600 }, reliability: { alpha: 8, beta: 2 }, risk: 'medium', trust_level: 'verified', conformance_level: 'verified', health: 'healthy', freshness: '2026-09-15T00:00:00.000Z', evidence_refs: [] },
    { schema_version: 'autoarmory/capability/v1', id: 'mcp.write-gateway', vendor: 'mcp-gateway', kind: 'mcp-gateway', version: '1.0.0', capabilities: ['execute-mcp-tool'], permissions: { read: true, write: true, network: true }, cost: { unit: 'usd', estimate: 0.01 }, latency_ms: { p50: 300, p95: 1000 }, reliability: { alpha: 7, beta: 3 }, risk: 'high', trust_level: 'verified', conformance_level: 'verified', health: 'healthy', freshness: '2026-09-15T00:00:00.000Z', evidence_refs: [] }
  ];
}

function runDemo(options) {
  const opts = options || {};
  const seed = Number(opts.seed || 7);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-demo-'));
  const registry = path.join(temp, 'capabilities.jsonl');
  const outcomes = path.join(temp, 'outcomes.jsonl');
  const suggestions = path.join(temp, 'suggestions.jsonl');
  const capabilities = demoCapabilities();
  writeJsonl(registry, capabilities);
  const steps = [];
  const standardRequest = { schema_version: 'autoarmory/routing-request/v1', task_type: 'run-agent-eval', risk: 'medium', data_sensitivity: 'internal', cost_budget: 0.05, latency_slo_ms: 2000, write_required: false, security_level: 'standard', context: {} };
  const standard = capability.route(capabilities, standardRequest, { seed: seed });
  steps.push({ id: 'route_standard', title: 'Choose the best eval runner under budget and latency constraints', selected: standard.selected.map(function (item) { return item.id; }), rejected: standard.rejected, reason: standard.reason });

  const writeRequest = { schema_version: 'autoarmory/routing-request/v1', task_type: 'execute-mcp-tool', risk: 'high', data_sensitivity: 'internal', cost_budget: 0.05, latency_slo_ms: 2000, write_required: true, security_level: 'standard', human_approval: false, context: {} };
  const rejected = capability.route(capabilities, writeRequest, { seed: seed });
  steps.push({ id: 'route_rejected', title: 'Reject a write-capable MCP gateway without human approval', selected: [], rejected: rejected.rejected, reason: 'fail-closed approval policy' });

  const approvedRequest = Object.assign({}, writeRequest, { human_approval: true });
  const approved = capability.route(capabilities, approvedRequest, { seed: seed });
  steps.push({ id: 'route_approved', title: 'Allow the write-capable gateway only after explicit approval', selected: approved.selected.map(function (item) { return item.id; }), rejected: approved.rejected, reason: approved.reason });

  capability.recordOutcome(registry, outcomes, { schema_version: 'autoarmory/outcome/v1', decision_id: standard.request_id, capability_id: 'runner.trusted', task_type: 'run-agent-eval', result: 'success', reward: 1, cost: 0.02, latency_ms: 1200, failure_mode: null, environment_fingerprint: 'demo-env', evidence: { before: 'fail', after: 'pass' }, verified: true, source: 'demo', propensity: 0.5, predicted_probability: 0.9, observed_at: new Date().toISOString() });
  for (let i = 0; i < 3; i++) capability.recordOutcome(registry, outcomes, { schema_version: 'autoarmory/outcome/v1', decision_id: standard.request_id, capability_id: 'runner.fast', task_type: 'run-agent-eval', result: 'success', reward: 1, cost: 0.005, latency_ms: 800, failure_mode: null, environment_fingerprint: 'demo-env', evidence: { i: i }, verified: true, source: 'demo', propensity: 0.5, predicted_probability: 0.7, observed_at: new Date().toISOString() });
  for (let i = 0; i < 3; i++) capability.recordOutcome(registry, outcomes, { schema_version: 'autoarmory/outcome/v1', decision_id: standard.request_id, capability_id: 'runner.fast', task_type: 'run-agent-eval', result: 'failure', reward: 0, cost: 0.005, latency_ms: 1400, failure_mode: 'state_drift', environment_fingerprint: 'demo-env', evidence: { i: i }, verified: true, source: 'demo', propensity: 0.5, predicted_probability: 0.7, observed_at: new Date().toISOString() });
  const updated = capability.readCapabilities(registry).find(function (item) { return item.id === 'runner.trusted'; });
  steps.push({ id: 'outcome_update', title: 'Update reliability from verified outcomes', capability: updated.id, alpha: updated.reliability.alpha, beta: updated.reliability.beta });
  const drift = capability.detectDrift(fs.readFileSync(outcomes, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse), { capability_id: 'runner.fast', threshold: 0.3 });
  steps.push({ id: 'drift_detection', title: 'Detect long-horizon drift', status: drift.status, drop: drift.drop, max_cusum: drift.max_cusum });
  const retirement = capability.retireCapability(registry, suggestions, 'runner.fast', 'Sustained outcome drift and failures.');
  steps.push({ id: 'retirement', title: 'Retire the degraded capability', capability: retirement.suggestion.capability_id, action: retirement.suggestion.action });
  const result = { schema_version: 'autoarmory/demo/v1', generated_at: new Date().toISOString(), seed: seed, capabilities: capabilities.map(function (item) { return item.id; }), steps: steps, verdict: 'AutoArmory selected, rejected, learned and retired capabilities with evidence.' };
  const markdown = '# AutoArmory Demo\n\n' + steps.map(function (item) { return '## ' + item.id + '\n\n' + item.title + '\n\n' + JSON.stringify(item, null, 2); }).join('\n\n') + '\n\n' + result.verdict + '\n';
  return { result: result, markdown: markdown };
}

module.exports = { runDemo, demoCapabilities };
