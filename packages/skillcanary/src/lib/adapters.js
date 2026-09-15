'use strict';

function asInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

function observation(pass, total) {
  const p = asInt(pass, null);
  const t = asInt(total, null);
  if (p === null || t === null || t < 1 || p > t) return null;
  return { pass: p, total: t };
}

function observationFrom(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.pass !== undefined && value.total !== undefined) return observation(value.pass, value.total);
  if (value.passed !== undefined && value.total !== undefined) return observation(value.passed, value.total);
  if (value.successes !== undefined && value.failures !== undefined) {
    return observation(value.successes, asInt(value.successes, 0) + asInt(value.failures, 0));
  }
  if (value.success !== undefined && value.total !== undefined) return observation(value.success, value.total);
  if (value.passed !== undefined && value.failed !== undefined) {
    return observation(value.passed, asInt(value.passed, 0) + asInt(value.failed, 0));
  }
  return null;
}

function trialPassed(item, key) {
  if (!item) return false;
  const candidates = [key, 'pass', 'passed', 'success', 'ok', 'correct', 'score'];
  for (const candidate of candidates) {
    if (candidate === undefined || item[candidate] === undefined) continue;
    const value = item[candidate];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value > 0;
    if (typeof value === 'string') {
      if (/^(pass|passed|true|ok|success)$/i.test(value.trim())) return true;
      if (/^(fail|failed|false|error)$/i.test(value.trim())) return false;
    }
  }
  if (item.result !== undefined) return /^(pass|passed|true|ok|success)$/i.test(String(item.result).trim());
  return false;
}

function countTrials(list, key) {
  if (!Array.isArray(list) || list.length === 0) return null;
  return observation(list.filter(function (item) { return trialPassed(item, key); }).length, list.length);
}

function pickCase(list, caseId) {
  if (!Array.isArray(list) || !list.length) return null;
  if (!caseId) return list[0];
  return list.find(function (item) {
    return item && (item.id === caseId || item.name === caseId || item.case_id === caseId || item.caseId === caseId);
  }) || null;
}

function extractSkillgrade(data) {
  const before = observationFrom(data.before || (data.summary && data.summary.before));
  const after = observationFrom(data.after || (data.summary && data.summary.after));
  if (before && after) return { before, after };

  const afterTrials = countTrials(data.trials || data.results || (data.summary && data.summary.trials));
  if (afterTrials) return { before: before || observation(0, afterTrials.total), after: afterTrials };
  return null;
}

function extractAgentSkillsEval(data, caseId) {
  const list = data.evals || data.results || data.cases || data.benchmarks;
  const hit = pickCase(list, caseId);
  if (!hit) return null;

  const beforeValue = hit.without_skill || hit.no_skill || hit.baseline || hit.before || hit.control || hit.withoutSkill;
  const afterValue = hit.with_skill || hit.skill || hit.candidate || hit.after || hit.treatment || hit.withSkill;
  const before = observationFrom(beforeValue) || countTrials(beforeValue && beforeValue.results, 'pass');
  const after = observationFrom(afterValue) || countTrials(afterValue && afterValue.results, 'pass');
  if (before && after) return { before, after };
  return null;
}

function extractPromptfoo(data) {
  const root = data.results || data;
  const stats = root.stats || data.stats || (data.summary && data.summary.stats);
  const summary = observationFrom(stats);
  if (summary) return { before: observation(0, summary.total), after: summary };

  const list = root.results || root.tests || data.tests;
  const after = countTrials(list, 'success');
  if (after) return { before: observation(0, after.total), after };
  return null;
}

function detectRunner(data) {
  if (!data || typeof data !== 'object') return null;
  if (data.results && data.results.stats) return 'promptfoo';
  if (data.stats && (data.stats.successes !== undefined || data.stats.failures !== undefined)) return 'promptfoo';
  if (Array.isArray(data.evals) || Array.isArray(data.benchmarks)) return 'agent-skills-eval';
  if (Array.isArray(data.results) && data.results.some(function (x) { return x && (x.without_skill || x.with_skill || x.baseline); })) return 'agent-skills-eval';
  if (data.trials || data.summary || data.before || data.after) return 'skillgrade';
  return null;
}

function extract(runner, data, caseId) {
  const resolved = runner === 'auto' ? detectRunner(data) : runner;
  let evidence = null;
  if (resolved === 'skillgrade') evidence = extractSkillgrade(data);
  else if (resolved === 'agent-skills-eval') evidence = extractAgentSkillsEval(data, caseId);
  else if (resolved === 'promptfoo') evidence = extractPromptfoo(data);
  if (!evidence) return null;
  return { runner: resolved, before: evidence.before, after: evidence.after };
}



const DESCRIPTORS = [
  { id: 'skillgrade', kind: 'runner', version: '1', capabilities: ['case_evidence', 'trials', 'summary'], input_schema: 'json', output_schema: 'EvidenceEnvelope', permissions: { read: true, write: false }, network: false, determinism: 'partial', trust: 'verified' },
  { id: 'agent-skills-eval', kind: 'runner', version: '1', capabilities: ['case_evidence', 'baseline', 'candidate'], input_schema: 'json', output_schema: 'EvidenceEnvelope', permissions: { read: true, write: false }, network: false, determinism: 'partial', trust: 'verified' },
  { id: 'promptfoo', kind: 'runner', version: '1', capabilities: ['case_evidence', 'summary', 'trials'], input_schema: 'json', output_schema: 'EvidenceEnvelope', permissions: { read: true, write: false }, network: false, determinism: 'partial', trust: 'verified' },
  { id: 'generic-security', kind: 'security', version: '1', capabilities: ['findings', 'severity', 'sarif-compatible'], input_schema: 'json', output_schema: 'RiskEnvelope', permissions: { read: true, write: false }, network: false, determinism: 'deterministic', trust: 'imported' },
  { id: 'generic-trace', kind: 'trace', version: '1', capabilities: ['spans', 'tools', 'errors', 'latency'], input_schema: 'json', output_schema: 'TraceEnvelope', permissions: { read: true, write: false }, network: false, determinism: 'observed', trust: 'imported' },
  { id: 'generic-registry', kind: 'registry', version: '1', capabilities: ['package', 'version', 'digest'], input_schema: 'json', output_schema: 'PackageDescriptor', permissions: { read: true, write: false }, network: false, determinism: 'deterministic', trust: 'imported' },
  { id: 'generic-provenance', kind: 'provenance', version: '1', capabilities: ['attestation', 'digest', 'signer'], input_schema: 'json', output_schema: 'AttestationEnvelope', permissions: { read: true, write: false }, network: false, determinism: 'deterministic', trust: 'imported' },
  { id: 'generic-mcp', kind: 'mcp', version: '1', capabilities: ['tool_contract', 'permissions', 'fallback'], input_schema: 'json', output_schema: 'ToolContract', permissions: { read: true, write: false }, network: false, determinism: 'deterministic', trust: 'imported' },
  { id: 'generic-evalport', kind: 'eval', version: '1', capabilities: ['test_cases', 'graders', 'results'], input_schema: 'json', output_schema: 'EvaluationSuite', permissions: { read: true, write: false }, network: false, determinism: 'deterministic', trust: 'imported' },
  { id: 'generic-otel', kind: 'trace', version: '1', capabilities: ['resource_spans', 'span_events', 'otel-compatible'], input_schema: 'json', output_schema: 'TraceEnvelope', permissions: { read: true, write: false }, network: false, determinism: 'observed', trust: 'imported' },
  { id: 'generic-langfuse', kind: 'trace', version: '1', capabilities: ['traces', 'observations', 'scores'], input_schema: 'json', output_schema: 'TraceEnvelope', permissions: { read: true, write: false }, network: false, determinism: 'observed', trust: 'imported' },
  { id: 'generic-mlflow', kind: 'trace', version: '1', capabilities: ['runs', 'metrics', 'artifacts'], input_schema: 'json', output_schema: 'TraceEnvelope', permissions: { read: true, write: false }, network: false, determinism: 'observed', trust: 'imported' }
];

function listDescriptors(kind) {
  if (!kind) return DESCRIPTORS.slice();
  return DESCRIPTORS.filter(function (descriptor) { return descriptor.kind === kind; });
}

function detectKinds(data) {
  const kinds = [];
  const runner = detectRunner(data);
  if (runner) kinds.push({ kind: 'runner', adapter: runner });
  if (data && (Array.isArray(data.findings) || Array.isArray(data.vulnerabilities) || data.risk_score !== undefined)) kinds.push({ kind: 'security', adapter: 'generic-security' });
  if (data && (Array.isArray(data.spans) || Array.isArray(data.traces))) kinds.push({ kind: 'trace', adapter: 'generic-trace' });
  if (data && (Array.isArray(data.resourceSpans) || data.traceId || data.spanId)) kinds.push({ kind: 'trace', adapter: 'generic-otel' });
  if (data && (Array.isArray(data.observations) || data.langfuse)) kinds.push({ kind: 'trace', adapter: 'generic-langfuse' });
  if (data && Array.isArray(data.runs) && data.runs.some(function (run) { return run && run.data && run.data.metrics; })) kinds.push({ kind: 'trace', adapter: 'generic-mlflow' });
  if (data && (Array.isArray(data.testCases) || Array.isArray(data.test_cases) || data.evalSuite || data.suite)) kinds.push({ kind: 'eval', adapter: 'generic-evalport' });
  if (data && (data.package || (data.name && data.version))) kinds.push({ kind: 'registry', adapter: 'generic-registry' });
  if (data && (data.attestation || data.subject || data.signature)) kinds.push({ kind: 'provenance', adapter: 'generic-provenance' });
  if (data && (data.tools || data.mcp || data.tool_prefix)) kinds.push({ kind: 'mcp', adapter: 'generic-mcp' });
  return kinds;
}

function normalizeSecurity(data) {
  const findings = (data.findings || data.vulnerabilities || data.results || []).map(function (item, index) {
    return {
      id: item.id || item.rule_id || 'finding-' + (index + 1),
      severity: String(item.severity || item.level || 'unknown').toLowerCase(),
      rule: item.rule || item.rule_id || item.check || 'unknown',
      message: item.message || item.description || '',
      path: item.path || item.file || '',
      evidence: item.evidence || {}
    };
  });
  return {
    schema_version: 'skillcanary/risk/v1',
    skill: data.skill || 'unknown-skill',
    scanner: data.scanner || data.tool || 'unknown-scanner',
    risk_score: data.risk_score,
    risk_severity: data.risk_severity || data.severity,
    findings,
    observed_at: data.observed_at || new Date().toISOString()
  };
}

function normalizeTrace(data) {
  const spans = data.spans || data.traces || data.events || [];
  return {
    schema_version: 'skillcanary/trace/v1',
    run_id: data.run_id || data.id || 'trace',
    skill: data.skill || 'unknown-skill',
    engine: data.engine || data.provider || 'unknown',
    model: data.model || 'unknown',
    spans: spans.map(function (span, index) {
      return {
        id: span.id || span.span_id || 'span-' + (index + 1),
        name: span.name || span.operation || span.type || 'span',
        status: span.status || (span.error ? 'error' : 'ok'),
        duration_ms: span.duration_ms !== undefined ? span.duration_ms : span.duration,
        tool: span.tool || span.tool_name,
        error: span.error || null
      };
    }),
    observed_at: data.observed_at || new Date().toISOString()
  };
}

function normalizeRegistry(data) {
  const pkg = data.package || data;
  return {
    schema_version: 'skillcanary/package/v1',
    name: pkg.name || data.name || 'unknown',
    version: pkg.version || data.version || 'unknown',
    digest: pkg.digest || data.digest || '',
    registry: data.registry || 'unknown',
    source: data.source || '',
    published_at: data.published_at || ''
  };
}

function normalizeEvaluationSuite(data) {
  return {
    schema_version: 'skillcanary/eval-suite/v1',
    name: data.name || (data.suite && data.suite.name) || 'imported-suite',
    test_cases: data.testCases || data.test_cases || (data.suite && data.suite.test_cases) || [],
    graders: data.graders || (data.suite && data.suite.graders) || [],
    results: data.results || (data.suite && data.suite.results) || [],
    source: data.source || 'evalport'
  };
}

function normalize(kind, data, options) {
  const opts = options || {};
  if (kind === 'runner') return { kind: 'evidence', evidence: extract(opts.adapter || 'auto', data, opts.caseId) };
  if (kind === 'security') return { kind: 'risk', risk: normalizeSecurity(data) };
  if (kind === 'trace') return { kind: 'trace', trace: normalizeTrace(data) };
  if (kind === 'registry') return { kind: 'package', package: normalizeRegistry(data) };
  if (kind === 'provenance') return { kind: 'provenance', provenance: data };
  if (kind === 'mcp') return { kind: 'mcp', mcp: data };
  if (kind === 'eval') return { kind: 'eval-suite', suite: normalizeEvaluationSuite(data) };
  return null;
}

module.exports = {
  observation,
  observationFrom,
  countTrials,
  detectRunner,
  extract,
  DESCRIPTORS,
  listDescriptors,
  detectKinds,
  normalize,
  normalizeSecurity,
  normalizeTrace,
  normalizeRegistry,
  normalizeEvaluationSuite
};