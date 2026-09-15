'use strict';

const fs = require('fs');
const path = require('path');
const { sha256, readJsonl, writeJsonl } = require('./util');
const capability = require('./capability');
const { parseOtelText } = require('./observe');

const ADAPTERS = [
  { id: 'skillgrade', kind: 'runner', description: 'SkillGrade runner results' },
  { id: 'promptfoo', kind: 'runner', description: 'promptfoo eval results' },
  { id: 'sarif', kind: 'scanner', description: 'SARIF scanner results' },
  { id: 'contextforge', kind: 'mcp-gateway', description: 'ContextForge-compatible MCP registry' },
  { id: 'otel', kind: 'observability', description: 'OpenTelemetry GenAI spans' }
];

function incident(source, index, mode, severity, evidence) { return { schema_version: 'selfforge/incident/v1', id: 'inc-' + sha256(source + ':' + index + ':' + mode).slice(0, 12), source: source, line: index + 1, failure_mode: mode, severity: severity, evidence: String(evidence).slice(0, 500), status: 'observed', observed_at: new Date().toISOString() }; }
function runnerCapability(id, vendor, source) { return { schema_version: 'autoarmory/capability/v1', id: id, vendor: vendor, kind: 'runner', version: '1.0.0', capabilities: ['run-agent-eval'], permissions: { read: true, write: false, network: false }, cost: { unit: 'usd', estimate: 0 }, latency_ms: { p50: 0, p95: 0 }, reliability: { alpha: 1, beta: 1 }, risk: 'medium', trust_level: 'candidate', conformance_level: 'normalized', health: 'unknown', freshness: new Date().toISOString(), evidence_refs: [source] }; }
function scannerCapability(source) { return { schema_version: 'autoarmory/capability/v1', id: 'scanner.sarif', vendor: 'sarif', kind: 'scanner', version: '2.1.0', capabilities: ['scan-skill'], permissions: { read: true, write: false, network: false }, cost: { unit: 'usd', estimate: 0 }, latency_ms: { p50: 0, p95: 0 }, reliability: { alpha: 1, beta: 1 }, risk: 'medium', trust_level: 'candidate', conformance_level: 'normalized', health: 'unknown', freshness: new Date().toISOString(), evidence_refs: [source] }; }
function mcpCapability(source) { return { schema_version: 'autoarmory/capability/v1', id: 'mcp.contextforge', vendor: 'contextforge', kind: 'mcp-gateway', version: '1.0.0', capabilities: ['execute-mcp-tool'], permissions: { read: true, write: false, network: true }, cost: { unit: 'usd', estimate: 0 }, latency_ms: { p50: 0, p95: 0 }, reliability: { alpha: 1, beta: 1 }, risk: 'high', trust_level: 'candidate', conformance_level: 'normalized', health: 'unknown', freshness: new Date().toISOString(), evidence_refs: [source] }; }

function importData(id, data, options) {
  const opts = options || {};
  const source = opts.source || id;
  if (id === 'otel') return { ok: true, adapter: id, capability: null, incidents: parseOtelText(JSON.stringify(data), source) };
  if (id === 'skillgrade' || id === 'promptfoo') {
    const capabilityId = id === 'skillgrade' ? 'runner.skillgrade' : 'runner.promptfoo';
    const rows = id === 'skillgrade' ? (data.tests || data.results || []) : (((data.results || {}).results) || data.results || []);
    const incidents = rows.filter(function (row) { return row.error || (row.after && row.after.total && row.after.pass < row.after.total) || row.success === false; }).map(function (row, index) { return incident(source, index, 'test_failure', 'high', row.error || row.testId || row.case_id || 'runner case failed'); });
    return { ok: true, adapter: id, capability: runnerCapability(capabilityId, id, source), incidents: incidents };
  }
  if (id === 'sarif') {
    const results = []; for (const run of data.runs || []) for (const item of run.results || []) results.push(item);
    return { ok: true, adapter: id, capability: scannerCapability(source), incidents: results.map(function (item, index) { return incident(source, index, 'security_finding', item.level === 'error' ? 'critical' : 'high', (item.ruleId || 'sarif') + ': ' + ((item.message && item.message.text) || '')); }) };
  }
  if (id === 'contextforge') return { ok: true, adapter: id, capability: mcpCapability(source), incidents: [] };
  return { ok: false, errors: ['unsupported integration: ' + id] };
}

function writeImport(state, result) {
  fs.mkdirSync(state, { recursive: true });
  if (result.capability) capability.registerCapability(path.join(state, 'capabilities.jsonl'), result.capability, { force: true });
  const incidentFile = path.join(state, 'incidents.jsonl');
  const existing = fs.existsSync(incidentFile) ? readJsonl(incidentFile) : [];
  const seen = new Set(existing.map(function (item) { return item.id; }));
  for (const item of result.incidents || []) if (!seen.has(item.id)) { seen.add(item.id); existing.push(item); }
  writeJsonl(incidentFile, existing);
  return { capability: result.capability ? result.capability.id : null, incidents: (result.incidents || []).length };
}
module.exports = { ADAPTERS, importData, writeImport };
