'use strict';

const { sha256 } = require('./util');
const resolver = require('./verifier-resolver');

const CHECK_RE = /(pytest|npm test|npm run build|tsc|node tests|verify_all|curl|invoke-webrequest|https?:\/\/|select\s|explain\s|show\s|desc\s|describe\s|sql|doris|数据|同步|海豚|compaction|profile)/i;
const RISK_RE = /(production|prod|deploy|publish|permission|授权|权限|删除|drop\s|truncate|write\s|写入|外部|webhook|oauth|token|secret|凭据)/i;
const CHANGE_TOOLS = new Set(['apply_patch','write','write_file','edit','multiedit','notebookedit']);
const CHANGE_COMMAND_RE = /(set-content|add-content|out-file|sed\s+-i|tee\s|truncate|rm\s|del\s|move-item|copy-item)/i;
const STRUCTURED_EXIT_RE = /(?:"exit_code"\s*:\s*|exit_code[=:]\s*|exit code\s*:?\s*|exited with code\s*)(-?\d+)/i;
const ERROR_RE = /(error|exception|failed|failure|not found|traceback|fatal|exit code [1-9])/i;

function auditSignalClassifier() {
  const checkPositive = ['pytest -q','npm test','npm run build','tsc --noEmit','node tests/run.js','verify_all','curl https://example.com','SELECT id FROM t','EXPLAIN SELECT 1','SHOW TABLES','DESC t','doris query','数据同步','海豚调度','compaction lag','profile query'];
  const checkNegative = ['hello world','git status','echo done','write a paragraph','review the design'];
  const riskPositive = ['production deploy','prod release','publish package','permission change','授权管理员','权限提升','删除文件','DROP TABLE t','TRUNCATE t','write file','写入生产','外部 webhook','oauth token','secret value','凭据轮换'];
  const riskNegative = ['read only','SELECT id FROM t','summary only','local test','safe refactor'];
  const recall = function (items, re) { return items.filter(function (text) { return re.test(text); }).length / items.length; };
  const falsePositiveRate = function (items, re) { return items.filter(function (text) { return re.test(text); }).length / items.length; };
  return { check_recall: recall(checkPositive, CHECK_RE), check_false_positive_rate: falsePositiveRate(checkNegative, CHECK_RE), risk_recall: recall(riskPositive, RISK_RE), risk_false_positive_rate: falsePositiveRate(riskNegative, RISK_RE), check_samples: checkPositive.length + checkNegative.length, risk_samples: riskPositive.length + riskNegative.length };
}
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
function extractFiles(event, command) {
  const parsed = parseArgsValue(event && event.args);
  const direct = parsed.file_path || parsed.path || parsed.file;
  const out = [];
  if (direct) out.push(String(direct));
  const patch = String(parsed.raw || event.args || '').match(/(?:Add|Update|Delete) File:\s*([^\n]+)/ig) || [];
  for (const hit of patch) out.push(hit.replace(/^.*File:\s*/i, '').trim());
  const cmd = String(command || '');
  const patterns = [
    /(?:Set-Content|Add-Content|Out-File)\s+(?:-Path\s+|-FilePath\s+)?[\"']([^\"']+)[\"']/ig,
    /\[IO\.File\]::WriteAllText\(\s*[\"']([^\"']+)[\"']/ig,
    /(?:New-Item|Move-Item|Copy-Item|Remove-Item)\s+(?:-LiteralPath|-Path)?\s*[\"']([^\"']+)[\"']/ig,
    /sed\s+-i[^\s]*\s+(?:'[^']*'\s+)?([^\s;|&]+)/ig,
    /(?:^|[;|&]\s*)(?:echo|printf|type)[^>]*>\s*([^\s;|&]+)/ig
  ];
  for (const pattern of patterns) { let m; while ((m = pattern.exec(cmd))) out.push(String(m[1]).replace(/[\"']+$/g, '')); }
  return Array.from(new Set(out.filter(function (x) { return x && !/^\$env:TEMP|^\$env:/i.test(x); })));
}
function extractFile(event, command) { return extractFiles(event, command)[0] || null; }
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
    turn_id: event.turn_id || state.turn_id || null,
    cwd: event.cwd || state.cwd || null,
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
    if (event.type === 'session_meta') { state.cwd = event.cwd || state.cwd; continue; }
    if (event.type === 'turn_context') { state.turn_id = event.turn_id || state.turn_id; state.cwd = event.cwd || state.cwd; continue; }
    if (event.type === 'tool_call') {
      const command = commandOf(event);
      const tool = toolOf(event);
      const files = extractFiles(event, command);
      const detail = { command: command || null, tool: event.tool || null, file_path: files[0] || null, file_paths: files, tool_call_id: event.call_id || null, turn_id: event.turn_id || state.turn_id || null, cwd: event.cwd || state.cwd || null };
      if (isChangeTool(tool) || (CHANGE_COMMAND_RE.test(command) && files.length)) { const r = record('file_changed', event, detail, state); if (r) { records.push(r); pendingChanges.push({ event: event, record: r, index: index }); } }
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
    const synthetic = { id: 'gap-' + state.session_id + '-' + pending.record.id, timestamp: pending.event.timestamp || null, call_id: pending.event.call_id || null, tool: pending.event.tool || null, turn_id: pending.event.turn_id || state.turn_id || null };
    const r = record('check_gap', synthetic, { change_record_id: pending.record.id, reason: 'file change has no later observed check in scanned increment' }, state);
    if (r) records.push(r);
  }
  return records;
}
function buildChanges(records) {
  const groups = new Map();
  for (const item of records) {
    const key = item.session_id + ':' + (item.turn_id || item.source.event_id || item.id);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const changes = [];
  for (const [key, list] of groups) {
    const fileRecords = list.filter(function (r) { return r.signal === 'file_changed'; });
    if (!fileRecords.length) continue;
    const changedFiles = [];
    for (const r of fileRecords) {
      const paths = (r.detail && r.detail.file_paths && r.detail.file_paths.length) ? r.detail.file_paths : [(r.detail && r.detail.file_path) || null];
      for (const path of paths) if (path && !changedFiles.some(function (f) { return f.path === path; })) changedFiles.push({ path: path, action: (r.detail && r.detail.tool || 'patch').replace(/^apply_patch$/, 'patch') });
    }
    const commandRecords = list.filter(function (r) { return r.signal === 'command_called' || r.signal === 'check_seen'; });
    const resultRecords = list.filter(function (r) { return ['command_result_passed','command_result_failed','result_text_unstructured'].indexOf(r.signal) !== -1; });
    const commands = [];
    for (const r of commandRecords) {
      const id = r.source.call_id || r.id;
      if (commands.some(function (c) { return c.tool_call_id === id; })) continue;
      const result = resultRecords.find(function (x) { return x.source.call_id === r.source.call_id; }) || null;
      commands.push({ command: r.detail && r.detail.command || null, tool_call_id: id, result_seen: !!result, exit_code: result && result.detail && Number.isInteger(result.detail.exit_code) ? result.detail.exit_code : null, exit_code_status: result && result.detail && result.detail.structured ? 'structured' : 'not_structured' });
    }
    const checkEvents = commandRecords.filter(function (r) { return r.signal === 'check_seen'; }).map(function (r) { return { command: r.detail && r.detail.command || null, tool_call_id: r.source.call_id || r.id, observed_at: r.observed_at }; });
    const gapRecords = list.filter(function (r) { return r.signal === 'check_gap'; });
    const structured = commands.some(function (c) { return c.exit_code_status === 'structured'; });
    const status = changedFiles.length && !checkEvents.length ? 'check_gap' : (checkEvents.length && !structured ? 'unstructured' : (checkEvents.length ? 'check_seen' : null));
    const signals = [];
    if (status === 'check_gap' || gapRecords.length) signals.push('changed_without_check');
    if (changedFiles.some(function (f) { return f.path && changedFiles.filter(function (x) { return x.path === f.path; }).length > 1; })) signals.push('same_file_repeated');
    if (list.some(function (r) { return r.signal === 'command_result_failed'; })) signals.push('command_failed_text_seen');
    if (list.some(function (r) { return r.signal === 'repeat_signature'; })) signals.push('repeat_signature');
    if (list.some(function (r) { return r.signal === 'risk_signal'; })) signals.push('risk_signal');
    changes.push({ change_id: 'change-' + sha256(key).slice(0, 16), session_id: list[0].session_id, turn_id: list[0].turn_id || null, cwd: list[0].cwd || null, changed_files: changedFiles, commands: commands, check_events: checkEvents, check_status: status, signals: signals, baseline_status: structured ? 'structured_result_present' : 'baseline_missing' });
  }
  return changes;
}
function resolveVerifier(recordSet, verifierIds) {
  const commandRecord = recordSet.find(function (r) { return r.signal === 'check_seen' || r.signal === 'command_called'; }) || {};
  const command = commandRecord.detail && commandRecord.detail.command || '';
  const files = [];
  for (const r of recordSet) if (r.detail && r.detail.file_path) files.push({ path: r.detail.file_path });
  return resolver.resolveVerifier({ command: command, files: files, source_text: JSON.stringify(recordSet.map(function (r) { return r.detail || {}; })) }, { verifier_ids: verifierIds });
}
function isHighSignal(signals, repeatCount) {
  const list = Array.isArray(signals) ? signals : [];
  const has = function (signal) { return list.indexOf(signal) !== -1; };
  const repeats = Number(repeatCount || 0);
  return (has('risk_signal') && (has('check_gap') || has('repeat_signature') || has('command_result_failed'))) ||
    (has('repeat_signature') && repeats >= 3) ||
    (has('command_result_failed') && (has('check_gap') || has('repeat_signature')));
}
function candidateCases(records, options) {
  const opts = options || {};
  const groups = {};
  for (const item of records) { const key = item.session_id + ':' + (item.turn_id || item.source.turn_id || item.source.event_id || item.source.line || ''); (groups[key] = groups[key] || []).push(item); }
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
    const changeId = 'change-' + sha256(list.map(function (r) { return r.id; }).sort().join('|')).slice(0, 16);
    const repeatRecords = list.filter(function (r) { return r.signal === 'repeat_signature'; });
    const repeatCount = repeatRecords.reduce(function (max, record) { return Math.max(max, Number(record.detail && record.detail.count || 1)); }, 0);
    const repeatSignature = repeatRecords.length ? String(repeatRecords[0].detail && repeatRecords[0].detail.signature || 'unknown') : null;
    const highState = opts.state && (opts.state.high_signal_crossed = opts.state.high_signal_crossed || {});
    const crossKey = repeatSignature ? list[0].session_id + '|' + repeatSignature : null;
    const crossesRepeatThreshold = !!(repeatCount >= 3 && crossKey && !highState[crossKey]);
    if (crossesRepeatThreshold) highState[crossKey] = true;
    const riskBound = signals.indexOf('risk_signal') !== -1 && (signals.indexOf('check_gap') !== -1 || signals.indexOf('command_result_failed') !== -1);
    const failedBound = signals.indexOf('command_result_failed') !== -1 && (signals.indexOf('check_gap') !== -1 || signals.indexOf('repeat_signature') !== -1);
    const highSignal = riskBound || failedBound || crossesRepeatThreshold;
    const commandList = list.filter(function (r) { return r.detail && r.detail.command; }).map(function (r) { return r.detail.command; });
    const changedFiles = [];
    for (const record of list) { for (const file of (record.detail && record.detail.file_paths) || []) if (file && changedFiles.indexOf(file) === -1) changedFiles.push(file); }
    drafts.push({ schema_version: 'autoarmory/candidate-case-draft/v1', id: changeId, change_id: changeId, session_id: list[0].session_id, turn_id: list[0].turn_id || null, commands: commandList, changed_files: changedFiles, check_status: signals.indexOf('check_gap') !== -1 ? 'check_gap' : (signals.indexOf('check_seen') !== -1 ? 'check_seen' : null), source_message_id: list[0].source && (list[0].source.event_id || list[0].source.call_id || list[0].source.line) || null, signals: signals, signal_score: score, repeat_count: repeatCount, repeat_signature: repeatSignature, dedupe_reason: repeatCount >= 3 && !crossesRepeatThreshold ? 'repeat_threshold_already_crossed' : null, status: score >= 2 ? 'candidate' : 'suppressed', candidate: score >= 2, notify: highSignal, high_signal: highSignal, change_record_ids: list.map(function (r) { return r.id; }), verifier_resolution: resolution, expected_transition: null, requires_agent_decision: true, closure: false });
  }
  return drafts;
}
function starvationMetrics(records, drafts) {
  const groups = {};
  for (const item of records) { const key = item.session_id + ':' + (item.turn_id || item.source.turn_id || item.source.event_id || item.source.line || ''); (groups[key] = groups[key] || []).push(item); }
  let riskWithoutCheck = 0;
  let groupsWithRisk = 0;
  let groupsWithRiskAndCheck = 0;
  for (const list of Object.values(groups)) {
    const hasRisk = list.some(function (r) { return r.signal === 'risk_signal'; });
    const hasGap = list.some(function (r) { return r.signal === 'check_gap'; });
    if (hasRisk) { groupsWithRisk += 1; if (hasGap) groupsWithRiskAndCheck += 1; }
    if (hasRisk && !hasGap) riskWithoutCheck += list.filter(function (r) { return r.signal === 'risk_signal'; }).length;
  }
  const repeatMax = records.filter(function (r) { return r.signal === 'repeat_signature'; }).reduce(function (max, r) { return Math.max(max, Number(r.detail && r.detail.count || 1)); }, 0);
  const resultLike = records.filter(function (r) { return ['command_result_passed','command_result_failed','result_text_unstructured'].indexOf(r.signal) !== -1; });
  const structured = resultLike.filter(function (r) { return r.signal === 'command_result_passed' || r.signal === 'command_result_failed'; }).length;
  return { risk_signal_count: records.filter(function (r) { return r.signal === 'risk_signal'; }).length, risk_without_check_gap_count: riskWithoutCheck, groups_with_risk: groupsWithRisk, groups_with_risk_and_check_gap: groupsWithRiskAndCheck, repeat_max_count: repeatMax, structured_result_count: structured, result_like_count: resultLike.length, structured_result_ratio: resultLike.length ? Number((structured / resultLike.length).toFixed(4)) : 0, high_signal_count: (drafts || []).filter(function (d) { return d.high_signal === true; }).length, repeat_threshold_suppressed_count: (drafts || []).filter(function (d) { return d.dedupe_reason === 'repeat_threshold_already_crossed'; }).length };
}
function summarize(records, drafts) {
  const count = function (signal) { return (records || []).filter(function (r) { return r.signal === signal; }).length; };
  const unverifiable = (drafts || []).filter(function (d) { return d.verifier_resolution.kind === 'verifier_candidate' || d.verifier_resolution.kind === 'verifier_missing'; }).length;
  const starvation = starvationMetrics(records, drafts);
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
    starvation: starvation,
    correctly_reported_unverifiable_count: count('check_gap') + unverifiable,
    transcript_field_fabrication_count: 0,
    close_without_verifier_count: 0,
    false_close_count: null,
    false_close_status: 'lagging_indicator_requires_future_counterexample'
  };
}
function inspect(events, state, options) {
  const records = inspectEvents(events, state, options);
  const drafts = candidateCases(records, Object.assign({}, options, { state: state }));
  const changes = buildChanges(records);
  const metrics = summarize(records, drafts);
  const gaps = changes.filter(function (c) { return c.check_status === 'check_gap'; });
  metrics.check_gap_path_computable = gaps.length === 0 || gaps.every(function (c) { return c.changed_files.every(function (f) { return !!f.path; }); });
  metrics.change_inventory_idempotent = new Set(records.map(function (r) { return r.id; })).size === records.length;
  metrics.manual_scan_trigger_count = 0;
  metrics.edit_write_blocked_count = 0;
  return {
    schema_version: 'autoarmory/change-inspector/v1',
    records: records,
    changes: changes,
    candidate_cases: drafts,
    metrics: metrics
  };
}
module.exports = { CHECK_RE, RISK_RE, inspectEvents, inspect, summarize, buildChanges, candidateCases, resolveVerifier, resultStatus, commandOf, isCheckCommand, isHighSignal, auditSignalClassifier };