'use strict';

const fs = require('fs');
const path = require('path');
const { readText, sha256, redact, walkFiles } = require('./util');
const { matchFailureModes, severityForMode } = require('./failure-modes');

const SIGNALS = [
  { mode: 'test_failure', severity: 'high', re: /(FAIL|failed|assertion|expected .* received|test.*failed)/i },
  { mode: 'runtime_error', severity: 'high', re: /\b(error|exception|traceback|timeout|exit code [1-9][0-9]*|failed with exit)\b/i },
  { mode: 'dead_reference', severity: 'medium', re: /(dead pointer|missing file|ENOENT|references? .* not found)/i },
  { mode: 'security_finding', severity: 'critical', re: /\b(prompt injection|data exfiltration|malicious (payload|code|skill|package)|credential leak|secret leaked|leaked secret)\b/i },
  { mode: 'drift', severity: 'high', re: /(drift|change point|distribution shift)/i },
  { mode: 'missing_evidence', severity: 'medium', re: /(no evidence|without evidence|missing evidence|unverified)/i },
  { mode: 'todo', severity: 'low', re: /(TODO|FIXME|HACK)/i }
];

function sourceRef(file) {
  return file === 'stdin' ? 'stdin' : path.resolve(file);
}

function collect(input) {
  const stat = fs.statSync(input);
  if (stat.isDirectory()) return walkFiles(input, { skip: ['.git'] });
  return [input];
}

function normalizeIncident(value, file, index, fallbackMode) {
  if (!value || typeof value !== 'object') return null;
  const source = sourceRef(file);
  if (value.schema_version === 'selfforge/incident/v1') {
    return Object.assign({}, value, { source: value.source || source, evidence: redact(value.evidence || '').slice(0, 500) });
  }
  const evidence = value.evidence || value.message || value.error || value.title || '';
  const mode = value.failure_mode || fallbackMode || 'runtime_error';
  return {
    schema_version: 'selfforge/incident/v1',
    id: 'inc-' + sha256(source + ':' + (index + 1) + ':' + mode).slice(0, 12),
    source: source,
    line: index + 1,
    failure_mode: mode,
    severity: value.severity || 'medium',
    evidence: redact(evidence).slice(0, 500),
    status: 'observed',
    observed_at: new Date().toISOString()
  };
}

function incidentsFromText(text, file) {
  const lines = String(text).split(/\r?\n/);
  const output = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (/\.jsonl?$/i.test(file) || line.charAt(0) === '{') {
      try {
        const parsed = JSON.parse(line);
        const normalized = normalizeIncident(parsed, file, i, null);
        if (normalized) { output.push(normalized); continue; }
      } catch (_) {}
    }
    for (const signal of SIGNALS) {
      if (!signal.re.test(line)) continue;
      const source = sourceRef(file);
      output.push({
        schema_version: 'selfforge/incident/v1',
        id: 'inc-' + sha256(source + ':' + (i + 1) + ':' + signal.mode).slice(0, 12),
        source: source,
        line: i + 1,
        failure_mode: signal.mode,
        severity: signal.severity,
        evidence: redact(line).slice(0, 500),
        status: 'observed',
        observed_at: new Date().toISOString()
      });
      break;
    }
  }
  return output;
}

function incidentsFromFile(file) {
  return incidentsFromText(readText(file), file);
}

function decodeXml(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function incidentsFromArticle(text, file) {
  const output = [];
  const seen = new Set();
  const lines = String(text).split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (!line) continue;
    for (const failure of matchFailureModes(line)) {
      const source = sourceRef(file);
      const id = 'inc-' + sha256(source + ':' + (index + 1) + ':' + failure.mode).slice(0, 12);
      if (seen.has(id)) continue;
      seen.add(id);
      output.push({ schema_version: 'selfforge/incident/v1', id: id, source: source, line: index + 1, failure_mode: failure.mode, severity: severityForMode(failure.mode), evidence: redact(line).slice(0, 500), status: 'observed', observed_at: new Date().toISOString() });
    }
  }
  return output;
}

function parseJUnitText(content, source) {
  const output = [];
  const pattern = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g;
  let match;
  let index = 0;
  while ((match = pattern.exec(content))) {
    const attrs = match[1] || '';
    const body = match[2] || '';
    const current = index;
    index++;
    if (!/<failure|<error/i.test(body)) continue;
    const name = (attrs.match(/name=["']([^"']+)/i) || [])[1] || 'test-' + (current + 1);
    const message = (body.match(/message=["']([^"']+)/i) || [])[1] || body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const ref = sourceRef(source || 'stdin');
    output.push({
      schema_version: 'selfforge/incident/v1',
      id: 'inc-' + sha256(ref + ':junit:' + current).slice(0, 12),
      source: ref,
      line: current + 1,
      failure_mode: 'test_failure',
      severity: 'high',
      evidence: redact(decodeXml(name) + ': ' + decodeXml(message)).slice(0, 500),
      status: 'observed',
      observed_at: new Date().toISOString()
    });
  }
  return output;
}

function parseJUnit(file) {
  return parseJUnitText(readText(file), file);
}

function parseGithubText(content, source) {
  const data = JSON.parse(content);
  const list = Array.isArray(data) ? data : (Array.isArray(data.issues) ? data.issues : [data]);
  const ref = sourceRef(source || 'stdin');
  return list.map(function (issue, index) {
    return {
      schema_version: 'selfforge/incident/v1',
      id: 'inc-' + sha256(ref + ':github:' + (issue.number || index)).slice(0, 12),
      source: issue.html_url || issue.url || ref,
      line: 1,
      failure_mode: issue.failure_mode || 'runtime_error',
      severity: issue.severity || 'medium',
      evidence: redact(issue.title || issue.body || 'GitHub issue').slice(0, 500),
      status: 'observed',
      observed_at: new Date().toISOString()
    };
  });
}

function parseGithub(file) {
  return parseGithubText(readText(file), file);
}

function attrMap(attributes) {
  const map = {};
  for (const attribute of attributes || []) {
    if (!attribute || !attribute.key) continue;
    const value = attribute.value || {};
    map[attribute.key] = value.stringValue !== undefined ? value.stringValue : (value.intValue !== undefined ? value.intValue : (value.boolValue !== undefined ? value.boolValue : value.doubleValue));
  }
  return map;
}

function parseOtelText(content, source) {
  const data = JSON.parse(content);
  const spans = [];
  for (const resource of data.resourceSpans || []) {
    for (const scope of resource.scopeSpans || []) {
      for (const span of scope.spans || []) spans.push(span);
    }
  }
  const ref = sourceRef(source || 'stdin');
  const output = [];
  spans.forEach(function (span, index) {
    const attrs = attrMap(span.attributes);
    const status = span.status || {};
    const errorType = attrs['error.type'] || '';
    const errorMessage = attrs['error.message'] || status.message || '';
    if (status.code !== 2 && !errorType) return;
    const tool = attrs['gen_ai.tool.name'] || '';
    const haystack = String(errorType + ' ' + errorMessage + ' ' + tool).toLowerCase();
    let mode = 'runtime_error';
    if (tool && (haystack.indexOf('unknown tool') !== -1 || haystack.indexOf('tool not found') !== -1 || haystack.indexOf('not_found') !== -1)) mode = 'tool_selection_error';
    else if (haystack.indexOf('parameter') !== -1 || haystack.indexOf('argument') !== -1 || haystack.indexOf('invalid') !== -1) mode = 'tool_parameter_error';
    const evidence = JSON.stringify({ name: span.name || '', operation: attrs['gen_ai.operation.name'] || '', agent: attrs['gen_ai.agent.name'] || '', tool: tool, error_type: errorType, message: errorMessage });
    output.push({ schema_version: 'selfforge/incident/v1', id: 'inc-' + sha256(ref + ':otel:' + (span.traceId || index) + ':' + (span.spanId || index) + ':' + mode).slice(0, 12), source: ref, line: index + 1, failure_mode: mode, severity: severityForMode(mode), evidence: redact(evidence).slice(0, 500), status: 'observed', observed_at: new Date().toISOString() });
  });
  return output;
}

function observeText(text, options) {
  const opts = options || {};
  const format = opts.format || 'auto';
  const source = opts.source || 'stdin';
  if (format === 'junit') return parseJUnitText(text, source);
  if (format === 'github') return parseGithubText(text, source);
  if (format === 'otel') return parseOtelText(text, source);
  if (format === 'article' || format === 'markdown') return incidentsFromArticle(text, source);
  if (format === 'jsonl' || format === 'log') return incidentsFromText(text, source);
  const trimmed = String(text).trim();
  if (/<testsuite|<testcase/i.test(trimmed)) return parseJUnitText(text, source);
  if (trimmed.charAt(0) === '[' || /^{[\s\S]*"issues"\s*:/.test(trimmed)) {
    try { return parseGithubText(text, source); } catch (_) {}
  }
  return incidentsFromText(text, source);
}

function observe(input, options) {
  const opts = options || {};
  if (opts.format === 'otel') return parseOtelText(readText(path.resolve(input)), path.resolve(input));
  if (opts.format === 'article' || opts.format === 'markdown') return incidentsFromArticle(readText(path.resolve(input)), path.resolve(input));
  if (opts.format === 'junit') return parseJUnit(path.resolve(input));
  if (opts.format === 'github') return parseGithub(path.resolve(input));
  const files = collect(path.resolve(input));
  const incidents = [];
  const seen = new Set();
  for (const file of files) {
    if (!/\.(md|txt|json|jsonl|log|yaml|yml|js|ts|py|sh)$/i.test(file)) continue;
    for (const incident of incidentsFromFile(file)) {
      if (!seen.has(incident.id)) {
        seen.add(incident.id);
        incidents.push(incident);
      }
    }
  }
  return incidents;
}

module.exports = { observe, observeText, incidentsFromFile, incidentsFromText, incidentsFromArticle, parseOtelText, parseJUnit, parseJUnitText, parseGithub, parseGithubText };
