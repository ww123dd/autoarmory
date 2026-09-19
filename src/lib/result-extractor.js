'use strict';
const fs = require('fs');
const path = require('path');
const { readJsonlStrict, readJsonlDedup, writeJsonl } = require('./util');
const sessionShadow = require('./session-shadow');
const { normalizeCommand } = require('./command-normalizer');

function parseText(text) {
  const value = String(text || '');
  if (!value.trim()) return null;
  const exit = value.match(/(?:exit_code\s*[:=]\s*|exit code\s*[:=]?\s*|exited with code\s*)(-?\d+)/i);
  if (exit) return { exit_code: Number(exit[1]), result: Number(exit[1]) === 0 ? 'pass' : 'fail', result_parse_source: 'exit_code_regex', stdout_sha256: null, stderr_sha256: null };
  if (/npm ERR!/i.test(value)) return { exit_code: null, result: 'fail', result_parse_source: 'test_summary', stdout_sha256: null, stderr_sha256: null };
  const passed = value.match(/(\d+)\s+passed/i);
  const failed = value.match(/(\d+)\s+failed/i);
  if (passed || failed) {
    const failedCount = failed ? Number(failed[1]) : 0;
    return { exit_code: failedCount === 0 ? 0 : 1, result: failedCount === 0 ? 'pass' : 'fail', result_parse_source: 'test_summary', stdout_sha256: null, stderr_sha256: null };
  }
  if (/\bPASS\b/.test(value)) return { exit_code: 0, result: 'pass', result_parse_source: 'test_summary', stdout_sha256: null, stderr_sha256: null };
  if (/\bFAIL\b/.test(value)) return { exit_code: 1, result: 'fail', result_parse_source: 'test_summary', stdout_sha256: null, stderr_sha256: null };
  if (/^\s*ok\s*$/im.test(value)) return { exit_code: 0, result: 'pass', result_parse_source: 'test_summary', stdout_sha256: null, stderr_sha256: null };
  return null;
}
function fromExecRecords(stateDir) {
  const file = path.join(stateDir, 'exec-records.jsonl');
  if (!fs.existsSync(file)) return [];
  return readJsonlStrict(file).map(function (record) {
    return { schema_version: 'autoarmory/structured-result/v1', source_ref: record.id, exit_code: record.exit_code, result: record.outcome === 'success' ? 'pass' : (record.outcome === 'failure' ? 'fail' : 'unknown'), result_parse_source: 'exec_record', stdout_sha256: record.output && record.output.stdout_sha256 || null, stderr_sha256: record.output && record.output.stderr_sha256 || null };
  });
}
function fromTranscript(file) {
  if (!fs.existsSync(file)) return [];
  const rows = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(function (line) { try { return JSON.parse(line); } catch (_) { return null; } }).filter(Boolean);
  const events = [];
  for (const row of rows) events.push.apply(events, sessionShadow.normalizeRows(row));
  const out = [];
  for (const event of events) {
    if (event.type !== 'tool_output') continue;
    const parsed = parseText(event.content || event.text || event.output || '');
    if (parsed) out.push(Object.assign({ schema_version: 'autoarmory/structured-result/v1', source_ref: event.tool_use_id || event.id || null }, parsed));
  }
  return out;
}
function deriveTransitionCandidates(stateDir) {
  const resultsFile = path.join(stateDir, 'structured-results.jsonl');
  if (!fs.existsSync(resultsFile)) return [];
  const results = readJsonlStrict(resultsFile);
  const records = fs.existsSync(path.join(stateDir, 'change-inspector', 'change-records.jsonl')) ? readJsonlDedup(path.join(stateDir, 'change-inspector', 'change-records.jsonl'), function (row) { return row.id; }) : [];
  const drafts = fs.existsSync(path.join(stateDir, 'decision-scan', 'decision-drafts.jsonl')) ? readJsonlStrict(path.join(stateDir, 'decision-scan', 'decision-drafts.jsonl')) : [];
  const recordByRef = {};
  for (const record of records) {
    if (record.source && record.source.call_id) recordByRef[record.source.call_id] = record;
    if (record.source && record.source.event_id) recordByRef[record.source.event_id] = record;
    if (record.id) recordByRef[record.id] = record;
  }
  const draftByRecord = {};
  for (const draft of drafts) for (const id of draft.source_refs || draft.change_record_ids || []) draftByRecord[id] = draft;
  const out = [];
  for (const result of results) {
    if (result.result !== 'pass' && result.result !== 'fail') continue;
    const record = recordByRef[result.source_ref];
    const draft = record ? draftByRecord[record.id] : null;
    if (!draft || !Array.isArray(draft.commands) || !draft.commands.length) continue;
    const normalized = normalizeCommand(draft.commands[0]);
    if (!normalized.candidate_transition) continue;
    const transition = normalized.command_family === 'test' && result.result === 'fail' ? 'TEST->FAIL' : normalized.candidate_transition;
    out.push({
      schema_version: 'autoarmory/transition-candidate/v1',
      change_id: draft.change_id,
      observed_facts: { source_ref: result.source_ref, exit_code: result.exit_code, result: result.result, command_family: normalized.command_family, stdout_sha256: result.stdout_sha256 || null, stderr_sha256: result.stderr_sha256 || null },
      candidate_transition: transition,
      transition_source: 'structured_result',
      source_strength: 'derived',
      evidence_refs: [result.source_ref].concat(record ? [record.id] : [])
    });
  }
  return out;
}
function extract(stateDir, options) {
  const opts = options || {};
  const rows = fromExecRecords(stateDir);
  for (const session of opts.sessions || []) for (const row of fromTranscript(session)) rows.push(row);
  if (opts.apply === true) writeJsonl(path.join(stateDir, 'structured-results.jsonl'), rows);
  const bySource = {};
  for (const row of rows) bySource[row.result_parse_source] = (bySource[row.result_parse_source] || 0) + 1;
  return { schema_version: 'autoarmory/result-extraction/v1', generated_at: new Date().toISOString(), count: rows.length, by_source: bySource, rows: rows };
}
module.exports = { parseText, fromExecRecords, fromTranscript, extract, deriveTransitionCandidates };