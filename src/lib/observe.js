'use strict';

const fs = require('fs');
const path = require('path');
const { readText, sha256, redact, walkFiles } = require('./util');

const SIGNALS = [
  { mode: 'test_failure', severity: 'high', re: /(FAIL|failed|assertion|expected .* received|test.*failed)/i },
  { mode: 'runtime_error', severity: 'high', re: /(error|exception|traceback|timeout|E[A-Z]+)/i },
  { mode: 'dead_reference', severity: 'medium', re: /(dead pointer|missing file|ENOENT|references? .* not found)/i },
  { mode: 'security_finding', severity: 'critical', re: /(prompt injection|data exfiltration|secret|credential|malicious)/i },
  { mode: 'drift', severity: 'high', re: /(drift|change point|distribution shift)/i },
  { mode: 'missing_evidence', severity: 'medium', re: /(no evidence|without evidence|missing evidence|unverified)/i },
  { mode: 'todo', severity: 'low', re: /(TODO|FIXME|HACK)/i }
];

function collect(input) {
  const stat = fs.statSync(input);
  if (stat.isDirectory()) return walkFiles(input, { skip: ['.git'] });
  return [input];
}

function normalizeIncident(value, file, index, fallbackMode) {
  if (!value || typeof value !== 'object') return null;
  if (value.schema_version === 'selfforge/incident/v1') return Object.assign({}, value, { source: value.source || path.resolve(file), evidence: redact(value.evidence || '').slice(0, 500) });
  const evidence = value.evidence || value.message || value.error || value.title || '';
  const mode = value.failure_mode || fallbackMode || 'runtime_error';
  return { schema_version: 'selfforge/incident/v1', id: 'inc-' + sha256(path.resolve(file) + ':' + (index + 1) + ':' + mode).slice(0, 12), source: path.resolve(file), line: index + 1, failure_mode: mode, severity: value.severity || 'medium', evidence: redact(evidence).slice(0, 500), status: 'observed', observed_at: new Date().toISOString() };
}

function incidentsFromFile(file) {
  const text = readText(file);
  const lines = text.split(/\r?\n/);
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
      const evidence = redact(line).slice(0, 500);
      output.push({ schema_version: 'selfforge/incident/v1', id: 'inc-' + sha256(path.resolve(file) + ':' + (i + 1) + ':' + signal.mode).slice(0, 12), source: path.resolve(file), line: i + 1, failure_mode: signal.mode, severity: signal.severity, evidence, status: 'observed', observed_at: new Date().toISOString() });
      break;
    }
  }
  return output;
}


function parseJUnit(file) {
  const content = readText(file);
  const output = [];
  const pattern = /<testcase\b((?:(?!\/>)[^>])*)>([\s\S]*?)<\/testcase>/g;
  let match; let index = 0;
  while ((match = pattern.exec(content))) {
    const attrs = match[1] || '';
    const body = match[2] || '';
    if (!/<failure|<error/i.test(body)) { index++; continue; }
    const name = (attrs.match(/name=["']([^"']+)/i) || [])[1] || 'test-' + (index + 1);
    const message = (body.match(/message=["']([^"']+)/i) || [])[1] || body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    output.push({ schema_version: 'selfforge/incident/v1', id: 'inc-' + sha256(path.resolve(file) + ':junit:' + index).slice(0, 12), source: path.resolve(file), line: index + 1, failure_mode: 'test_failure', severity: 'high', evidence: redact(name + ': ' + message).slice(0, 500), status: 'observed', observed_at: new Date().toISOString() });
    index++;
  }
  return output;
}

function parseGithub(file) {
  const data = JSON.parse(readText(file));
  const list = Array.isArray(data) ? data : (Array.isArray(data.issues) ? data.issues : [data]);
  return list.map(function (issue, index) {
    return { schema_version: 'selfforge/incident/v1', id: 'inc-' + sha256(path.resolve(file) + ':github:' + (issue.number || index)).slice(0, 12), source: issue.html_url || path.resolve(file), line: 1, failure_mode: issue.failure_mode || 'runtime_error', severity: issue.severity || 'medium', evidence: redact(issue.title || issue.body || 'GitHub issue').slice(0, 500), status: 'observed', observed_at: new Date().toISOString() };
  });
}

function observe(input, options) {
  const opts = options || {};
  if (opts.format === 'junit') return parseJUnit(path.resolve(input));
  if (opts.format === 'github') return parseGithub(path.resolve(input));
  const files = collect(path.resolve(input));
  const incidents = [];
  const seen = new Set();
  for (const file of files) {
    if (!/\.(md|txt|json|jsonl|log|yaml|yml|js|ts|py|sh)$/i.test(file)) continue;
    for (const incident of incidentsFromFile(file)) { if (!seen.has(incident.id)) { seen.add(incident.id); incidents.push(incident); } }
  }
  return incidents;
}

module.exports = { observe, incidentsFromFile, parseJUnit, parseGithub };
