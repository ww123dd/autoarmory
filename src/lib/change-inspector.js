'use strict';

const { sha256 } = require('./util');

const CHECK_RE = /(pytest|npm test|npm run build|tsc|node tests|verify_all|curl|invoke-webrequest|https?:\/\/|select\s|explain\s|show\s|desc\s|describe\s|sql|doris|数据|同步|海豚|compaction|profile)/i;
const RISK_RE = /(production|prod|deploy|publish|permission|授权|权限|删除|drop\s|truncate|write\s|写入|外部|webhook|oauth|token|secret|凭据)/i;
const CHANGE_TOOLS = new Set(['apply_patch','write','write_file','edit','multiedit','notebookedit']);
const CHANGE_COMMAND_RE = /(git\s+commit|set-content|add-content|out-file|sed\s+-i|tee\s|truncate|rm\s|del\s|move-item|copy-item|git\s+apply)/i;
const STRUCTURED_EXIT_RE = /"exit_code"\s*:\s*(-?\d+)/;
const ERROR_RE = /(error|exception|failed|failure|not found|traceback|fatal|exit code [1-9])/i;

function parseArgsValue(value) { try { return JSON.parse(value || '{}'); } catch (_) { return { raw: String(value || '') }; } }
function commandOf(event) {
  const tool = String(event && event.tool || '').toLowerCase();
  if (!/(exec|bash|shell|powershell|cmd)/.test(tool)) return '';
  const parsed = parseArgsValue(event && event.args);
  return String(parsed.cmd || parsed.command || '').trim();
}
function toolOf(event) { return String(event && event.tool || '').toLowerCase(); }
function isChangeTool(tool) { return CHANGE_TOOLS.has(tool); }
function isCheckCommand(command) { return CHECK_RE.test(String(command || '')); }
function isRisk(text) { return RISK_RE.test(String(text || '')); }
function structuredExitCode(text) { const m = String(text || '').match(STRUCTURED_EXIT_RE); return m ? Number(m[1]) : null; }
function resultStatus(text) {
  const code = structuredExitCode(text);
  if (code === 0) return { status: 'command_result_passed', structured: true, exit_code: 0 };
  if (Number.isInteger(code)) return { status: 'command_result_failed', structured: true, exit_code: code };
  if (String(text || '').trim()) return { status: 'result_text_unstructured', structured: false, exit_code: null };
  return { status: 'result_text_unstructured', structured: false, exit_code: null };
}
function signature(text) {
  const normalized = String(text || '').toLowerCase().replace(/[0-9a-f]{8,}/g, '<id>').replace(/\d+/g, '<n>').replace(/\s+/g, ' ').trim().slice(0, 300);
  return ERROR_RE.test(normalized) ? sha256(normalized).slice(0, 16) : null;
}
function eventId(event, kind) { return sha256([event && event.call_id, event && event.id, event && event.timestamp, kind].join(':')).slice(0, 20); }
function record(kind, event, detail, state) {
  const id = eventId(event, kind);
  if (state.seen_ids[id]) return null;
  state.seen_ids[id] = true;
  return {
    schema_version: 'autoarmory/change-record/v1',
    id: id,
    session_id: state.session_id,
    signal: kind,
    observed_at: event.timestamp || null,
    source: { line: state.line, event_id: event.id || null, call_id: event.call_id || null, tool: event.tool || null },
    detail: detail || {}
  };
}
function inspectEvents(events, state, options) {
  const opts = options || {};
  state.signature_events = state.signature_events || {};
  const records = [];
  const pending = {};
  const risks = [];
  const pendingChanges = [];
  for (let index = 0; index < events.length; index++) {
    const event = events[index];
    if (event.type === 'tool_call') {
      const command = commandOf(event);
      const tool = toolOf(event);
      const detail = { command: command || null, tool: event.tool || null };
      if (isChangeTool(tool) || CHANGE_COMMAND_RE.test(command)) { const r = record('file_changed', event, detail, state); if (r) { records.push(r); pendingChanges.push({ event: event, record: r, index: index }); } }
      if (command) { const r = record('command_called', event, detail, state); if (r) records.push(r); }
      if (isCheckCommand(command)) {
        const r = record('check_seen', event, detail, state); if (r) records.push(r); for (let p = pendingChanges.length - 1; p >= 0; p--) { if (index - pendingChanges[p].index <= 20) pendingChanges.splice(p, 1); }
        if (!opts.execRecords || !opts.execRecords.length) { const g = record('exec_record_gap', event, { command: command, reason: 'transcript command was not wrapped by exec-record' }, state); if (g) records.push(g); }
      }
      if (isRisk(command) || isRisk(event.text)) { const r = record('risk_signal', event, detail, state); if (r) { records.push(r); risks.push(r); } }
      pending[event.call_id || event.id || ('pending-' + index)] = { event: event, command: command, index: index };
    } else if (event.type === 'tool_output') {
      const pendingCall = pending[event.call_id] || null;
      if (!pendingCall) continue;
      const result = resultStatus(event.text);
      if (pendingCall.command) {
        const detail = { command: pendingCall.command, status: result.status, structured: result.structured, exit_code: result.exit_code };
        const r = record(result.status, event, detail, state); if (r) records.push(r);
      }
      if (result.status === 'command_result_failed' || ERROR_RE.test(event.text)) {
        const sig = signature(event.text);
        if (sig) {
          const sigKey = event.call_id || event.id || (state.session_id + ':' + index);
          if (!state.signature_events[sigKey]) {
            state.signature_events[sigKey] = true;
            state.signatures[sig] = (state.signatures[sig] || 0) + 1;
            if (state.signatures[sig] >= 2) { const rep = record('repeat_signature', event, { signature: sig, count: state.signatures[sig], command: pendingCall.command || null }, state); if (rep) records.push(rep); }
          }
        }
      }
      delete pending[event.call_id];
    } else if (event.type === 'message' && event.role === 'assistant') {
      if (isRisk(event.text)) { const r = record('risk_signal', event, { text: String(event.text).slice(0, 300) }, state); if (r) { records.push(r); risks.push(r); } }
    }
  }
  for (const pending of pendingChanges) {
    const synthetic = { id: 'gap-' + state.session_id + '-' + pending.record.id, timestamp: pending.event.timestamp || null, call_id: pending.event.call_id || null, tool: pending.event.tool || null };
    const r = record('check_gap', synthetic, { change_record_id: pending.record.id, reason: 'file change has no later observed check in scanned increment' }, state);
    if (r) records.push(r);
  }
  return records;
}
function resolveVerifier(recordSet, verifierIds) {
  const text = recordSet.map(function (r) { return JSON.stringify(r.detail || {}); }).join(' ');
  const command = (recordSet.find(function (r) { return r.signal === 'check_seen' || r.signal === 'command_called'; }) || {}).detail || {};
  const cmd = command.command || '';
  for (const id of verifierIds || []) if (text.indexOf(id) !== -1) return { kind: 'registered', ref: id };
  if (/(pytest|npm test|node tests|verify_all|tsc|npm run build)/i.test(cmd)) return { kind: 'project_test', ref: cmd };
  if (/(git status|git diff|git commit)/i.test(cmd)) return { kind: 'git_status', ref: cmd };
  if (/(sha256|hash)/i.test(cmd)) return { kind: 'file_hash', ref: cmd };
  if (/(curl|invoke-webrequest|https?:\/\/|select\s|explain\s|show\s|desc\s|describe\s|sql|doris|process|dom|build)/i.test(cmd)) return { kind: 'verifier_candidate', ref: cmd };
  return { kind: 'verifier_missing', ref: null };
}
function candidateCases(records, options) {
  const opts = options || {};
  const groups = {};
  for (const item of records) { const key = item.session_id + ':' + (item.source.turn_id || item.source.event_id || item.source.line || ''); (groups[key] = groups[key] || []).push(item); }
  const drafts = [];
  for (const list of Object.values(groups)) {
    const signals = Array.from(new Set(list.map(function (r) { return r.signal; })));
    let score = 0;
    if (signals.indexOf('check_gap') !== -1) score += 2;
    if (signals.indexOf('repeat_signature') !== -1) score += 2;
    if (signals.indexOf('risk_signal') !== -1) score += 2;
    if (signals.indexOf('command_result_failed') !== -1) score += 2;
    if (signals.indexOf('file_changed') !== -1) score += 1;
    const resolution = resolveVerifier(list, opts.verifier_ids || []);
    const id = 'candidate-' + sha256(list.map(function (r) { return r.id; }).join('|')).slice(0, 16);
    const notify = score >= 4 || signals.indexOf('repeat_signature') !== -1 || signals.indexOf('risk_signal') !== -1 || signals.indexOf('command_result_failed') !== -1;
drafts.push({ schema_version: 'autoarmory/candidate-case-draft/v1', id: id, session_id: list[0].session_id, signals: signals, signal_score: score, status: score >= 2 ? 'candidate' : 'suppressed', notify: notify, change_record_ids: list.map(function (r) { return r.id; }), verifier_resolution: resolution, expected_transition: null, requires_agent_decision: true, closure: false });
  }
  return drafts;
}
function summarize(records, drafts) {
  const count = function (signal) { return (records || []).filter(function (r) { return r.signal === signal; }).length; };
  const unverifiable = (drafts || []).filter(function (d) { return d.verifier_resolution.kind === 'verifier_candidate' || d.verifier_resolution.kind === 'verifier_missing'; }).length;
  return {
    change_record_count: (records || []).length,
    file_changed_count: count('file_changed'),
    command_called_count: count('command_called'),
    check_seen_count: count('check_seen'),
    check_gap_count: count('check_gap'),
    command_result_passed_count: count('command_result_passed'),
    command_result_failed_count: count('command_result_failed'),
    result_text_unstructured_count: count('result_text_unstructured'),
    repeat_signature_count: count('repeat_signature'),
    risk_signal_count: count('risk_signal'),
    exec_record_gap_count: count('exec_record_gap'),
    candidate_case_draft_count: (drafts || []).filter(function (d) { return d.status === 'candidate'; }).length,
    high_signal_notification_count: (drafts || []).filter(function (d) { return d.notify === true; }).length,
    suppressed_count: (drafts || []).filter(function (d) { return d.status === 'suppressed'; }).length,
    correctly_reported_unverifiable_count: count('check_gap') + unverifiable,
    transcript_field_fabrication_count: 0,
    close_without_verifier_count: 0,
    false_close_count: null,
    false_close_status: 'lagging_indicator_requires_future_counterexample'
  };
}
function inspect(events, state, options) {
  const records = inspectEvents(events, state, options);
  const drafts = candidateCases(records, options);
  return {
    schema_version: 'autoarmory/change-inspector/v1',
    records: records,
    candidate_cases: drafts,
    metrics: summarize(records, drafts)
  };
}
module.exports = { inspectEvents, inspect, summarize, candidateCases, resolveVerifier, resultStatus, commandOf, isCheckCommand };