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
    if (!bySession.has(session)) bySession.set(session, { records: [], bySignature: new Map() });
    const state = bySession.get(session);
    state.records.push(record);
    const current = state.bySignature.get(signature) || { signature: signature, occurrences: 0, observed: detail.signature || detail.command || signature };
    current.occurrences = Math.max(current.occurrences, count);
    state.bySignature.set(signature, current);
    maxBySignature.set(signature, Math.max(maxBySignature.get(signature) || 0, count));
  }
  const sessions = [];
  for (const [session, state] of bySession.entries()) {
    const rows = Array.from(state.bySignature.values()).sort(function (a, b) { return b.occurrences - a.occurrences; });
    const selected = rows[0] || null;
    const ordered = state.records.slice().sort(function (a, b) { return String(a.observed_at || '').localeCompare(String(b.observed_at || '')) || Number(a.source && a.source.line || 0) - Number(b.source && b.source.line || 0); });
    let last = null;
    let run = 0;
    let maxRun = 0;
    let maxRunSignature = null;
    for (const record of ordered) {
      const signature = record.detail && record.detail.signature;
      if (signature === last) run += 1;
      else { last = signature; run = 1; }
      if (run > maxRun) { maxRun = run; maxRunSignature = signature; }
    }
    const cumulativeTrigger = !!(selected && selected.occurrences >= threshold);
    const consecutiveTrigger = maxRun >= threshold;
    const evidence = {
      schema_version: 'autoarmory/exec-retry-storm-evidence/v1',
      threshold: threshold,
      signature: consecutiveTrigger ? maxRunSignature : selected && selected.signature || null,
      observed: selected && selected.observed || null,
      occurrences: consecutiveTrigger ? maxRun : selected && selected.occurrences || 0,
      max_count: selected && selected.occurrences || 0,
      max_run: maxRun,
      first_stop_index: consecutiveTrigger ? threshold - 1 : null,
      should_have_stopped: consecutiveTrigger,
      cumulative_trigger: cumulativeTrigger
    };
    evidence.evidence_sha256 = sha256(JSON.stringify(evidence));
    sessions.push(Object.assign({ session_id: session }, evidence));
  }
  const countTwo = new Set(Array.from(maxBySignature.entries()).filter(function (entry) { return entry[1] === 2; }).map(function (entry) { return entry[0]; }));
  return {
    schema_version: 'autoarmory/exec-retry-storm-replay/v1',
    threshold: threshold,
    sessions_scanned: sessions.length,
    positive_sessions: sessions.filter(function (row) { return row.should_have_stopped; }).length,
    positive_sessions_by_max_count: sessions.filter(function (row) { return row.cumulative_trigger; }).length,
    count_two_signatures: countTwo.size,
    false_positive_on_count_two: Array.from(countTwo).filter(function (signature) { return sessions.some(function (row) { return row.should_have_stopped && row.signature === signature; }); }).length,
    sessions: sessions
  };
}
module.exports = { ERROR_RE, normalizedFailure, itemFailure, analyze, fromJsonl, fromChangeRecords };

