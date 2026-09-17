'use strict';

const history = require('./history-replay');

function value(value) { return value === undefined ? null : value; }
function sanitizeMechanismRun(run) {
  return {
    id: run.id,
    mechanism_id: run.mechanism_id,
    case_id: run.case_id,
    result: run.result,
    counterexample: { kind: run.counterexample && run.counterexample.kind || null },
    finished_at: value(run.finished_at || run.recorded_at)
  };
}
function sanitizeRoutingDecision(decision) {
  return {
    request_id: decision.request_id,
    selected: (decision.selected || []).map(function (item) { return { id: item.id }; }),
    rejected: (decision.rejected || []).map(function (item) { return { id: item.id }; }),
    evidence_refs: (decision.evidence_refs || []).map(function (item) { return item && item.id ? { id: item.id } : {}; })
  };
}
function sanitizeRoutingActual(actual) {
  return { decision_id: actual.decision_id, outcome: actual.outcome, source: actual.source, at: value(actual.at) };
}
function sanitizeUsage(record) {
  return {
    source_decision_id: record.source_decision_id || record.run_id,
    run_id: record.run_id,
    cost_usd: value(record.cost_usd),
    tokens: record.tokens ? { input: record.tokens.input, output: record.tokens.output, cache_read: record.tokens.cache_read, total: record.tokens.total } : null,
    outcome: record.outcome ? { status: record.outcome.status, pass_rate: record.outcome.pass_rate, passed: record.outcome.passed, failed: record.outcome.failed, total: record.outcome.total } : null,
    skill_invoked: record.skill_invoked === true,
    tool_calls: value(record.tool_calls),
    observed_at: value(record.observed_at)
  };
}
function historySnapshot(input, options) {
  const opts = options || {};
  const streams = {
    mechanism_runs: (input.mechanism_runs || []).map(sanitizeMechanismRun),
    routing_decisions: (input.routing_decisions || []).map(sanitizeRoutingDecision),
    routing_actuals: (input.routing_actuals || []).map(sanitizeRoutingActual),
    outcomes: (input.outcomes || []).map(function (item) { return { decision_id: item.decision_id, result: item.result, outcome: item.outcome, cost: value(item.cost), tokens: value(item.tokens), observed_at: value(item.observed_at) }; }),
    transitions: (input.transitions || []).map(function (item) { return { id: item.id, action_tier: value(item.action_tier), to: item.to }; }),
    usage_records: (input.usage_records || []).map(sanitizeUsage)
  };
  return {
    schema_version: 'autoarmory/history-replay-snapshot/v1',
    captured_at: opts.captured_at || new Date().toISOString(),
    source_sha256: opts.source_sha256 || null,
    stream_counts: {
      mechanism_runs: streams.mechanism_runs.length,
      routing_decisions: streams.routing_decisions.length,
      routing_actuals: streams.routing_actuals.length,
      outcomes: streams.outcomes.length,
      transitions: streams.transitions.length,
      usage_records: streams.usage_records.length
    },
    streams: streams
  };
}
function verifySnapshot(snapshot, options) {
  if (!snapshot || snapshot.schema_version !== 'autoarmory/history-replay-snapshot/v1' || !snapshot.streams) {
    return { ok: false, errors: ['history replay snapshot must use autoarmory/history-replay-snapshot/v1'] };
  }
  const report = history.replayHistory(snapshot.streams, options || {});
  report.snapshot_source_sha256 = snapshot.source_sha256;
  report.ok = report.insufficient_real_stream === false && report.synthetic_record_count === 0 && report.llm_judge_calls === 0 && (report.metrics ? report.metrics.replay_escape_count === 0 : true);
  return report;
}
module.exports = { historySnapshot, verifySnapshot, sanitizeUsage, sanitizeMechanismRun };