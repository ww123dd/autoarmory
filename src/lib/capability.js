'use strict';

const fs = require('fs');
const { readJsonl, writeJsonl } = require('./util');

const KINDS = ['runner', 'evaluator', 'scanner', 'mcp-gateway', 'registry', 'observability', 'provenance', 'memory', 'ci', 'policy'];
const RISKS = ['low', 'medium', 'high', 'critical'];
const TRUST_LEVELS = ['untrusted', 'candidate', 'verified', 'trusted'];
const CONFORMANCE_LEVELS = ['imported', 'normalized', 'verified', 'live', 'ci-gated'];
const HEALTH_LEVELS = ['unknown', 'healthy', 'degraded', 'offline'];

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeCapability(value) {
  const now = new Date().toISOString();
  const source = value || {};
  return Object.assign({}, source, {
    schema_version: 'autoarmory/capability/v1',
    id: source.id || '',
    vendor: source.vendor || '',
    kind: source.kind || '',
    version: source.version || '',
    capabilities: Array.isArray(source.capabilities) ? source.capabilities.slice() : [],
    permissions: Object.assign({ read: true, write: false, network: false }, source.permissions || {}),
    cost: Object.assign({ unit: 'usd', estimate: 0 }, source.cost || {}),
    latency_ms: Object.assign({ p50: 0, p95: 0 }, source.latency_ms || {}),
    reliability: Object.assign({ alpha: 1, beta: 1 }, source.reliability || {}),
    risk: source.risk || 'medium',
    trust_level: source.trust_level || 'candidate',
    conformance_level: source.conformance_level || 'imported',
    health: source.health || 'unknown',
    freshness: source.freshness || now,
    evidence_refs: Array.isArray(source.evidence_refs) ? source.evidence_refs.slice() : [],
    created_at: source.created_at || now,
    updated_at: now
  });
}

function validateCapability(value) {
  const errors = [];
  if (!value || typeof value !== 'object') return ['capability must be an object'];
  if (value.schema_version !== 'autoarmory/capability/v1') errors.push('schema_version must be autoarmory/capability/v1');
  if (typeof value.id !== 'string' || !value.id.trim()) errors.push('missing id');
  if (typeof value.vendor !== 'string' || !value.vendor.trim()) errors.push('missing vendor');
  if (KINDS.indexOf(value.kind) === -1) errors.push('kind must be one of ' + KINDS.join(', '));
  if (typeof value.version !== 'string' || !value.version.trim()) errors.push('missing version');
  if (!Array.isArray(value.capabilities) || value.capabilities.length === 0 || value.capabilities.some(function (item) { return typeof item !== 'string' || !item.trim(); })) errors.push('capabilities must be a non-empty string array');
  if (!value.permissions || typeof value.permissions.read !== 'boolean' || typeof value.permissions.write !== 'boolean' || typeof value.permissions.network !== 'boolean') errors.push('permissions.read/write/network must be booleans');
  if (!value.cost || num(value.cost.estimate, -1) < 0) errors.push('cost.estimate must be >= 0');
  if (!value.latency_ms || num(value.latency_ms.p50, -1) < 0 || num(value.latency_ms.p95, -1) < 0) errors.push('latency_ms.p50/p95 must be >= 0');
  if (!value.reliability || num(value.reliability.alpha, 0) <= 0 || num(value.reliability.beta, 0) <= 0) errors.push('reliability.alpha/beta must be > 0');
  if (RISKS.indexOf(value.risk) === -1) errors.push('risk must be one of ' + RISKS.join(', '));
  if (TRUST_LEVELS.indexOf(value.trust_level) === -1) errors.push('trust_level must be one of ' + TRUST_LEVELS.join(', '));
  if (CONFORMANCE_LEVELS.indexOf(value.conformance_level) === -1) errors.push('conformance_level must be one of ' + CONFORMANCE_LEVELS.join(', '));
  if (HEALTH_LEVELS.indexOf(value.health) === -1) errors.push('health must be one of ' + HEALTH_LEVELS.join(', '));
  if (typeof value.freshness !== 'string' || !Number.isFinite(Date.parse(value.freshness))) errors.push('freshness must be an ISO timestamp');
  return errors;
}

function readCapabilities(file) {
  if (!fs.existsSync(file)) return [];
  return readJsonl(file).map(normalizeCapability);
}

function registerCapability(file, value, options) {
  const opts = options || {};
  const capability = normalizeCapability(value);
  const errors = validateCapability(capability);
  if (errors.length) return { ok: false, errors: errors };
  const capabilities = readCapabilities(file);
  const index = capabilities.findIndex(function (item) { return item.id === capability.id; });
  if (index !== -1 && !opts.force) return { ok: false, errors: ['capability already exists: ' + capability.id + ' (use --force to replace)'] };
  if (index === -1) capabilities.push(capability);
  else capabilities[index] = capability;
  writeJsonl(file, capabilities);
  return { ok: true, capability: capability, count: capabilities.length };
}

function healthRows(capabilities, options) {
  const now = options && options.now ? options.now : Date.now();
  return (capabilities || []).map(function (capability) {
    const ageDays = (now - Date.parse(capability.freshness)) / 86400000;
    let status = capability.health;
    if (capability.health === 'offline') status = 'offline';
    else if (ageDays > 30) status = 'degraded';
    else if (capability.health === 'healthy' && ['verified', 'live', 'ci-gated'].indexOf(capability.conformance_level) !== -1) status = 'healthy';
    else if (capability.health === 'healthy') status = 'unknown';
    return { id: capability.id, kind: capability.kind, status: status, age_days: Math.max(0, ageDays), conformance_level: capability.conformance_level, health: capability.health };
  });
}

module.exports = { KINDS, RISKS, TRUST_LEVELS, CONFORMANCE_LEVELS, HEALTH_LEVELS, normalizeCapability, validateCapability, readCapabilities, registerCapability, healthRows };
