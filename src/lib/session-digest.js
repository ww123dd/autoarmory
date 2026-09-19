'use strict';

const { readJsonl } = require('./util');

// Factual, record-backed session digest. Every line is derived from change
// records; nothing here interprets intent - the records capture what was done,
// not why. This is a reading surface, not evidence and not a verdict.
function digest(records, options) {
  const opts = options || {};
  const days = Number(opts.days || 0);
  const limit = Number(opts.limit || 8);
  const cutoff = days ? Date.now() - days * 86400000 : 0;
  const bySession = new Map();
  for (const record of records) {
    const sid = record && record.session_id;
    if (!sid) continue;
    if (cutoff && record.observed_at && Date.parse(record.observed_at) < cutoff) continue;
    if (!bySession.has(sid)) bySession.set(sid, []);
    bySession.get(sid).push(record);
  }
  const sessions = [];
  for (const [sessionId, list] of bySession.entries()) {
    const times = list.map(function (r) { return r.observed_at; }).filter(Boolean).sort();
    const commands = new Map();
    const files = new Set();
    let checks = 0, gaps = 0, failed = 0, risk = 0, changed = 0;
    const repeats = new Map();
    for (const record of list) {
      const detail = record.detail || {};
      if (record.signal === 'command_called' || record.signal === 'check_seen') {
        const command = String(detail.command || '').toLowerCase().replace(/\s+/g, ' ').trim();
        if (command && !/^(cd|get-content|get-childitem|select-string|rg|cat|ls|dir)\b/.test(command)) commands.set(command, (commands.get(command) || 0) + 1);
      }
      if (record.signal === 'file_changed') { for (const file of detail.file_paths || []) if (file) files.add(file); changed += 1; }
      if (record.signal === 'check_seen') checks += 1;
      if (record.signal === 'check_gap') gaps += 1;
      if (record.signal === 'command_result_failed') failed += 1;
      if (record.signal === 'risk_signal') risk += 1;
      if (record.signal === 'repeat_signature') {
        const sig = detail.signature;
        if (sig) repeats.set(sig, Math.max(repeats.get(sig) || 0, Number(detail.count || 1)));
      }
    }
    sessions.push({
      session_id: sessionId,
      day: String(sessionId).replace(/^rollout-/, '').slice(0, 10),
      span: times.length ? [times[0].slice(0, 10), times[times.length - 1].slice(0, 10)] : [],
      records: list.length,
      files_changed: files.size,
      file_change_events: changed,
      checks: checks,
      check_gaps: gaps,
      structured_failures: failed,
      risk_signals: risk,
      repeat_patterns_ge3: Array.from(repeats.values()).filter(function (count) { return count >= 3; }).length,
      top_commands: Array.from(commands.entries()).sort(function (a, b) { return b[1] - a[1]; }).slice(0, Number(opts.top || 3)).map(function (entry) { return { count: entry[1], command: entry[0].slice(0, 90) }; })
    });
  }
  sessions.sort(function (a, b) { return b.records - a.records; });
  const aggregate = sessions.reduce(function (acc, session) {
    acc.checks += session.checks; acc.check_gaps += session.check_gaps; acc.structured_failures += session.structured_failures; acc.risk_signals += session.risk_signals;
    return acc;
  }, { sessions: sessions.length, checks: 0, check_gaps: 0, structured_failures: 0, risk_signals: 0 });
  return { schema_version: 'autoarmory/session-digest/v1', generated_at: new Date().toISOString(), records_input: records.length, aggregate: aggregate, sessions: sessions.slice(0, limit) };
}

function digestFromEngine(engineDir, options) {
  return digest(readJsonl(require('path').join(engineDir, 'change-records.jsonl')), options);
}

module.exports = { digest, digestFromEngine };
