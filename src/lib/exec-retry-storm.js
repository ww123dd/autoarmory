'use strict';
const fs = require('fs');
const path = require('path');
const { sha256, readJsonlStrict } = require('./util');
const inspector = require('./change-inspector');

const ERROR_RE = /(error|exception|failed|failure|not found|traceback|fatal|exit code [1-9])/i;

function normalizedFailure(text) {
  const normalized = inspector.normalizedError(text);
  if (!normalized || !ERROR_RE.test(normalized)) return null;
  return { signature: inspector.signature(normalized), observed: normalized };
}
function itemFailure(item) {
  if (!item || typeof item !== 'object') return null;
  if (item.signature || item.signature_hash) {
    return { signature: item.signature || item.signature_hash, observed: item.observed || item.signature_text || item.signature || item.signature_hash };
  }
  if (item.is_error !== true && item.exit_code === undefined && !/tool_output/.test(String(item.type || ''))) return null;
  if (item.exit_code !== undefined && item.exit_code !== 0 && item.exit_code !== null) {
    const found = normalizedFailure(item.text || item.output || '');
    if (found) return found;
    return { signature: 'exit-code:' + item.exit_code, observed: 'exit_code=' + item.exit_code };
  }
  return normalizedFailure(item.text || item.output || '');
}
function analyze(items, options) {
  const opts = options || {};
  const threshold = Math.max(1, Number(opts.threshold || 3));
  const list = Array.isArray(items) ? items : [];
  let previous = null;
  let run = 0;
  let maxRun = 0;
  let maxSignature = null;
  let maxObserved = null;
  let firstStopIndex = null;
  let failureCount = 0;
  for (let index = 0; index < list.length; index++) {
    const failure = itemFailure(list[index]);
    if (!failure || !failure.signature) continue;
    failureCount += 1;
    if (previous && failure.signature === previous) run += 1;
    else run = 1;
    previous = failure.signature;
    if (run > maxRun) {
      maxRun = run;
      maxSignature = failure.signature;
      maxObserved = failure.observed;
    }
    if (firstStopIndex === null && run >= threshold) firstStopIndex = index;
  }
  const evidence = { schema_version: 'autoarmory/exec-retry-storm-evidence/v1', threshold: threshold, signature: maxSignature, observed: maxObserved, occurrences: maxRun, first_stop_index: firstStopIndex, failure_count: failureCount, should_have_stopped: firstStopIndex !== null };
  evidence.evidence_sha256 = sha256(JSON.stringify(evidence));
  return evidence;
}
function fromJsonl(file, options) {
  return analyze(readJsonlStrict(path.resolve(file)), options);
}
function fromChangeRecords(records, options) {
  const opts = options || {};
  const threshold = Math.max(1, Number(opts.threshold || 3));
  const bySession = new Map();
  const maxBySignature = new Map();
  for (const record of records || []) {
    if (!record || record.signal !== 'repeat_signature') continue;
    const session = record.session_id || 'unknown';
    const detail = record.detail || {};
    const signature = detail.signature;
    const count = Number(detail.count || 0);
    if (!signature) continue;
    if (!bySession.has(session)) bySession.set(session, new Map());
    const bySignature = bySession.get(session);
    const current = bySignature.get(signature) || { signature: signature, occurrences: 0, observed: detail.signature || detail.command || signature, first_line: Number(record.source && record.source.line || 0) };
    current.occurrences = Math.max(current.occurrences, count);
    current.first_line = Math.min(current.first_line, Number(record.source && record.source.line || 0));
    bySignature.set(signature, current);
    maxBySignature.set(signature, Math.max(maxBySignature.get(signature) || 0, count));
  }
  const countTwo = new Set(Array.from(maxBySignature.entries()).filter(function (entry) { return entry[1] === 2; }).map(function (entry) { return entry[0]; }));
  const sessions = [];
  for (const [session, bySignature] of bySession.entries()) {
    const rows = Array.from(bySignature.values()).sort(function (a, b) { return b.occurrences - a.occurrences || a.first_line - b.first_line; });
    const selected = rows[0] || null;
    const occurrences = selected ? selected.occurrences : 0;
    const evidence = {
      schema_version: 'autoarmory/exec-retry-storm-evidence/v1',
      threshold: threshold,
      signature: selected && selected.signature || null,
      observed: selected && selected.observed || null,
      occurrences: occurrences,
      first_stop_index: occurrences >= threshold ? threshold - 1 : null,
      failure_count: occurrences,
      should_have_stopped: occurrences >= threshold
    };
    evidence.evidence_sha256 = sha256(JSON.stringify(evidence));
    sessions.push(Object.assign({ session_id: session }, evidence));
  }
  return {
    schema_version: 'autoarmory/exec-retry-storm-replay/v1',
    threshold: threshold,
    sessions_scanned: sessions.length,
    positive_sessions: sessions.filter(function (row) { return row.should_have_stopped; }).length,
    count_two_signatures: countTwo.size,
    false_positive_on_count_two: Array.from(countTwo).filter(function (signature) { return sessions.some(function (row) { return row.should_have_stopped && row.signature === signature; }); }).length,
    sessions: sessions
  };
}
module.exports = { ERROR_RE, normalizedFailure, itemFailure, analyze, fromJsonl, fromChangeRecords };

