'use strict';

const fs = require('fs');
const crypto = require('crypto');
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

// Health is a projection, not a claim of its own. When the caller supplies the state of
// the mechanisms a capability points at (options.evidence: { mechanism_id: { status,
// lifecycle } }), stale or retired evidence downgrades the capability: a capability whose
// proof was rolled back is offline, and one whose proof no longer verifies is degraded.
function healthRows(capabilities, options) {
  const opts = options || {};
  const now = opts.now ? opts.now : Date.now();
  const evidence = opts.evidence || {};
  return (capabilities || []).map(function (capability) {
    const ageDays = (now - Date.parse(capability.freshness)) / 86400000;
    let status = capability.health;
    if (capability.health === 'offline') status = 'offline';
    else if (ageDays > 30) status = 'degraded';
    else if (capability.health === 'healthy' && ['verified', 'live', 'ci-gated'].indexOf(capability.conformance_level) !== -1) status = 'healthy';
    else if (capability.health === 'healthy') status = 'unknown';
    let reason = null;
    const checked = [];
    for (const ref of (capability.evidence_refs || [])) {
      if (typeof ref !== 'string' || !evidence[ref]) continue;
      const state = evidence[ref];
      checked.push({ ref: ref, status: state.status || null, lifecycle: state.lifecycle || null });
      if (state.lifecycle === 'retired') {
        status = 'offline';
        reason = 'evidence retired: ' + ref + ' (' + (state.reason || 'rolled back') + ')';
        break;
      }
      if (state.status !== 'verified' && state.status !== 'closed') {
        status = 'degraded';
        reason = 'evidence stale: ' + ref + ' (' + state.status + ')';
        break;
      }
      reason = reason || 'evidence ok: ' + ref + ' (' + state.status + ')';
    }
    return { id: capability.id, kind: capability.kind, status: status, age_days: Math.max(0, ageDays), conformance_level: capability.conformance_level, health: capability.health, reason: reason, evidence: checked };
  });
}


const RISK_RANK = { low: 1, medium: 2, high: 3, critical: 4 };

function makeRng(seed) {
  let state = (Number(seed) || 1) >>> 0;
  return function () { state += 0x6D2B79F5; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function boxMuller(rng) { const u = Math.max(rng(), Number.EPSILON); const v = Math.max(rng(), Number.EPSILON); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function sampleGamma(shape, rng) {
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x;
    let v;
    do { x = boxMuller(rng); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
function sampleBeta(alpha, beta, rng) { const x = sampleGamma(Math.max(0.0001, alpha), rng); const y = sampleGamma(Math.max(0.0001, beta), rng); return x / (x + y); }
function reliabilityMean(item) { return item.reliability.alpha / (item.reliability.alpha + item.reliability.beta); }

function filterCapabilities(capabilities, request) {
  const eligible = [];
  const rejected = [];
  for (const item of capabilities || []) {
    let reason = null;
    if (item.health === 'offline') reason = 'capability is offline';
    else if ((item.capabilities || []).indexOf(request.task_type) === -1) reason = 'does not provide task_type ' + request.task_type;
    else if ((RISK_RANK[item.risk] || 99) > (RISK_RANK[request.risk] || 99)) reason = 'risk exceeds request limit';
    else if (request.write_required && !item.permissions.write) reason = 'missing write permission';
    else if ((request.write_required || item.risk === 'high' || item.risk === 'critical') && request.human_approval !== true) reason = 'requires human approval';
    else if (request.data_sensitivity === 'restricted' && item.permissions.network) reason = 'restricted data cannot use a network capability';
    else if (request.security_level === 'restricted' && item.trust_level !== 'trusted') reason = 'restricted security requires trusted capability';
    else if (request.security_level === 'elevated' && item.trust_level === 'untrusted') reason = 'elevated security rejects untrusted capability';
    else if (Number(item.cost.estimate) > Number(request.cost_budget)) reason = 'cost exceeds request budget';
    else if (Number(item.latency_ms.p95) > Number(request.latency_slo_ms)) reason = 'latency exceeds request SLO';
    if (reason) rejected.push({ id: item.id, reason: reason }); else eligible.push(item);
  }
  return { eligible: eligible, rejected: rejected };
}

function route(capabilities, request, options) {
  const opts = options || {};
  const filtered = filterCapabilities(capabilities, request);
  if (!filtered.eligible.length) return { ok: false, errors: ['no eligible capability'], rejected: filtered.rejected, request: request };
  const actualSeed = (opts.seed === undefined || opts.seed === null || opts.seed === '') ? crypto.randomInt(1, 2147483647) : Number(opts.seed);
  const rng = makeRng(actualSeed);
  const ranked = filtered.eligible.map(function (item) {
    const sample = sampleBeta(Number(item.reliability.alpha), Number(item.reliability.beta), rng);
    const costPenalty = request.cost_budget > 0 ? Number(item.cost.estimate) / Number(request.cost_budget) : Number(item.cost.estimate);
    const latencyPenalty = request.latency_slo_ms > 0 ? Number(item.latency_ms.p95) / Number(request.latency_slo_ms) : Number(item.latency_ms.p95);
    const riskPenalty = (RISK_RANK[item.risk] || 4) / 4;
    return { id: item.id, score: sample - 0.1 * costPenalty - 0.1 * latencyPenalty - 0.05 * riskPenalty, posterior_mean: reliabilityMean(item) };
  }).sort(function (a, b) { return b.score - a.score || a.id.localeCompare(b.id); });
  const requestId = 'route-' + require('./util').sha256(JSON.stringify(request) + ':' + actualSeed + ':' + crypto.randomUUID()).slice(0, 12);
  return {
    ok: true,
    schema_version: 'autoarmory/routing-decision/v1',
    request_id: requestId,
    request: request,
    selected: ranked.slice(0, 1),
    rejected: filtered.rejected,
    fallback_chain: ranked.slice(1, 4).map(function (item) { return item.id; }),
    reason: 'deterministic constraint filter + constrained Thompson sampling',
    policy_version: 'autoarmory/policy/v1',
    seed: actualSeed,
    evidence_refs: []
  };
}

function portfolio(capabilities) {
  const items = (capabilities || []).map(function (item) {
    return { id: item.id, reliability: reliabilityMean(item), cost: Number(item.cost.estimate), latency_p95: Number(item.latency_ms.p95), risk: RISK_RANK[item.risk] || 4, freshness: Date.parse(item.freshness) || 0, capability: item };
  });
  const frontier = items.filter(function (item) {
    return !items.some(function (other) {
      if (other === item) return false;
      const noWorse = other.reliability >= item.reliability && other.cost <= item.cost && other.latency_p95 <= item.latency_p95 && other.risk <= item.risk && other.freshness >= item.freshness;
      const better = other.reliability > item.reliability || other.cost < item.cost || other.latency_p95 < item.latency_p95 || other.risk < item.risk || other.freshness > item.freshness;
      return noWorse && better;
    });
  }).sort(function (a, b) { return b.reliability - a.reliability || a.cost - b.cost || a.id.localeCompare(b.id); });
  return { schema_version: 'autoarmory/portfolio/v1', frontier: frontier.map(function (item) { return { id: item.id, reliability: item.reliability, cost: item.cost, latency_p95: item.latency_p95, risk: item.risk, freshness: item.freshness }; }) };
}


function validateOutcome(value) {
  const errors = [];
  if (!value || typeof value !== 'object') return ['outcome must be an object'];
  if (value.schema_version !== 'autoarmory/outcome/v1') errors.push('schema_version must be autoarmory/outcome/v1');
  if (typeof value.decision_id !== 'string' || !value.decision_id) errors.push('missing decision_id');
  if (typeof value.capability_id !== 'string' || !value.capability_id) errors.push('missing capability_id');
  if (['success', 'failure', 'partial'].indexOf(value.result) === -1) errors.push('result must be success, failure or partial');
  if (!Number.isFinite(Number(value.reward))) errors.push('reward must be a number');
  if (typeof value.verified !== 'boolean') errors.push('verified must be a boolean');
  if (typeof value.source !== 'string' || !value.source) errors.push('source is required');
  return errors;
}

function recordOutcome(registryFile, outcomesFile, value) {
  const errors = validateOutcome(value);
  if (errors.length) return { ok: false, errors: errors };
  const capabilities = readCapabilities(registryFile);
  const index = capabilities.findIndex(function (item) { return item.id === value.capability_id; });
  if (index === -1) return { ok: false, errors: ['capability not found: ' + value.capability_id] };
  const outcomes = fs.existsSync(outcomesFile) ? readJsonl(outcomesFile) : [];
  outcomes.push(value);
  writeJsonl(outcomesFile, outcomes);
  const capability = capabilities[index];
  if (value.verified === true && value.source !== 'fixture') {
    if (value.result === 'success') capability.reliability.alpha += 1;
    else if (value.result === 'failure') capability.reliability.beta += 1;
    else { capability.reliability.alpha += 0.5; capability.reliability.beta += 0.5; }
    capability.updated_at = new Date().toISOString();
    capabilities[index] = capability;
    writeJsonl(registryFile, capabilities);
  }
  return { ok: true, applied: value.verified === true && value.source !== 'fixture', reason: value.source === 'fixture' ? 'fixture outcome does not update reliability' : null, capability: capability, outcome: value };
}

function detectDrift(outcomes, options) {
  const opts = options || {};
  const list = (outcomes || []).filter(function (item) { return !opts.capability_id || item.capability_id === opts.capability_id; });
  const min = Number(opts.min || 6);
  if (list.length < min) return { schema_version: 'autoarmory/drift/v1', status: 'insufficient_data', samples: list.length, min: min };
  const half = Math.floor(list.length / 2);
  const older = list.slice(0, half);
  const recent = list.slice(half);
  const success = function (item) { return item.result ? item.result === 'success' : Number(item.reward) > 0; };
  const baseline = older.filter(success).length / older.length;
  const current = recent.filter(success).length / recent.length;
  const drop = baseline - current;
  let cusum = 0;
  let maxCusum = 0;
  for (const item of recent) { cusum = Math.max(0, cusum + (success(item) ? -1 : 1)); maxCusum = Math.max(maxCusum, cusum); }
  const threshold = Number(opts.threshold || 0.3);
  const alert = drop >= threshold || maxCusum >= 3;
  return { schema_version: 'autoarmory/drift/v1', status: alert ? 'alert' : 'ok', capability_id: opts.capability_id || null, samples: list.length, baseline: baseline, recent: current, drop: drop, max_cusum: maxCusum, threshold: threshold };
}

function conformanceCheck(capability, options) {
  const opts = options || {};
  const errors = validateCapability(capability);
  const warnings = [];
  const ageDays = (Date.now() - Date.parse(capability.freshness)) / 86400000;
  if (ageDays > Number(opts.max_age_days || 30)) errors.push('freshness is older than ' + Number(opts.max_age_days || 30) + ' days');
  if (capability.conformance_level === 'imported') warnings.push('capability is still imported and not normalized');
  if (!capability.evidence_refs || capability.evidence_refs.length === 0) warnings.push('no evidence_refs declared');
  return { schema_version: 'autoarmory/conformance/v1', id: capability.id, ok: errors.length === 0, level: capability.conformance_level, errors: errors, warnings: warnings };
}

function retireCapability(registryFile, suggestionsFile, id, reason) {
  const capabilities = readCapabilities(registryFile);
  const index = capabilities.findIndex(function (item) { return item.id === id; });
  if (index === -1) return { ok: false, errors: ['capability not found: ' + id] };
  capabilities[index].health = 'offline';
  capabilities[index].updated_at = new Date().toISOString();
  writeJsonl(registryFile, capabilities);
  const suggestion = { schema_version: 'autoarmory/replacement-suggestion/v1', candidate_id: 'retire-' + require('./util').sha256(id + ':' + reason + ':' + Date.now()).slice(0, 12), capability_id: id, action: 'retire', reason: reason, evidence_refs: [] };
  const suggestions = fs.existsSync(suggestionsFile) ? readJsonl(suggestionsFile) : [];
  suggestions.push(suggestion);
  writeJsonl(suggestionsFile, suggestions);
  return { ok: true, suggestion: suggestion, capability: capabilities[index] };
}

module.exports = { KINDS, RISKS, TRUST_LEVELS, CONFORMANCE_LEVELS, HEALTH_LEVELS, normalizeCapability, validateCapability, readCapabilities, registerCapability, healthRows, filterCapabilities, route, portfolio, sampleBeta, reliabilityMean, validateOutcome, recordOutcome, detectDrift, conformanceCheck, retireCapability };
