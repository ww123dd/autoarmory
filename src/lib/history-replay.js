'use strict';

const { sha256 } = require('./util');

function asArray(value) { return Array.isArray(value) ? value : []; }
function numberOrNull(value) { return Number.isFinite(Number(value)) ? Number(value) : null; }
function recordsOf(value) { return asArray(value); }
function indexBy(rows, key) {
  const out = {};
  for (const row of rows || []) if (row && row[key]) out[row[key]] = row;
  return out;
}
function outcomeReward(status) {
  if (status === 'success' || status === 'pass') return 1;
  if (status === 'partial') return 0.5;
  if (status === 'failure' || status === 'fail') return 0;
  return null;
}
function mechanismOutcome(run) {
  const status = run && run.result;
  return status === 'pass' || status === 'fail' ? { source: 'mechanism-run', status: status, reward: outcomeReward(status), observed_at: run.finished_at || run.recorded_at || null } : null;
}
function decisionOutcome(decision, outcomeIndex) {
  const outcome = outcomeIndex[decision && decision.request_id] || null;
  if (!outcome) return null;
  const status = outcome.result || outcome.outcome || null;
  return {
    source: outcome.schema_version || 'recorded-outcome',
    status: status,
    reward: outcomeReward(status),
    cost: Number.isFinite(Number(outcome.cost)) ? Number(outcome.cost) : null,
    tokens: Number.isFinite(Number(outcome.tokens || outcome.token_cost)) ? Number(outcome.tokens || outcome.token_cost) : null,
    observed_at: outcome.observed_at || outcome.at || null
  };
}
function buildOutcomeIndex(outcomes, actuals) {
  const index = {};
  for (const row of outcomes || []) if (row && row.decision_id) index[row.decision_id] = row;
  for (const row of actuals || []) if (row && row.decision_id && !index[row.decision_id]) index[row.decision_id] = row;
  return index;
}
function classification(value) { return value == null ? null : String(value); }
function boundaryFor(record, context) {
  const classes = [];
  const outcome = record.real_outcome || null;
  const source = record.source_type;
  if (source === 'mechanism_run' && outcome && outcome.status === 'fail') classes.push('near_pass_fail');
  if (source === 'mechanism_run' && context.previous_results && context.previous_results.some(function (item) { return item === 'fail'; }) && outcome && outcome.status === 'pass') classes.push('near_pass_fail');
  if (record.failure_signature && context.failure_signatures && context.failure_signatures[record.failure_signature] > 1) classes.push('repeated_failure');
  if (record.expires_at || record.verification_stale_days) {
    const ageMs = Date.now() - Date.parse(record.finished_at || record.recorded_at || 0);
    const staleDays = Number(record.verification_stale_days || 30);
    if (Number.isFinite(ageMs) && ageMs >= staleDays * 86400000 * 0.8) classes.push('near_expiry');
  }
  if (record.action_tier && ['local_write', 'irreversible_write', 'external_side_effect'].indexOf(record.action_tier) !== -1) classes.push('high_impact');
  if (record.trigger_conflict) classes.push('trigger_conflict');
  const unique = Array.from(new Set(classes));
  return { classes: unique, score: unique.length / 5, selected: unique.length > 0 };
}
function buildReplayRecords(input, boundaryContext) {
  const streams = input || {};
  const mechanismRuns = recordsOf(streams.mechanism_runs);
  const decisions = recordsOf(streams.routing_decisions);
  const outcomes = recordsOf(streams.outcomes);
  const actuals = recordsOf(streams.routing_actuals);
  const transitions = recordsOf(streams.transitions);
  const usageRecords = recordsOf(streams.usage_records);
  const outcomeIndex = buildOutcomeIndex(outcomes, actuals);
  const records = [];
  const counts = { mechanism_runs:0, routing_decisions:0, transitions:0, usage_records:0 };
  for (const run of mechanismRuns) {
    const real = mechanismOutcome(run);
    if (!real) continue;
    const row = {
      source_type: 'mechanism_run',
      source_decision_id: run.id,
      source_record: run,
      real_outcome: real,
      reward: real.reward,
      result: run.result,
      mechanism_id: run.mechanism_id || null,
      case_id: run.case_id || null,
      failure_signature: run.counterexample && run.counterexample.kind || null,
      action_tier: null,
      trigger_conflict: false,
      recorded_at: run.finished_at || run.recorded_at || null
    };
    row.boundary = boundaryFor(row, boundaryContext);
    records.push(row); counts.mechanism_runs += 1;
  }
  for (const decision of decisions) {
    const real = decisionOutcome(decision, outcomeIndex);
    if (!real) continue;
    const selected = decision.selected && decision.selected[0] ? decision.selected[0].id : null;
    const row = {
      source_type: 'routing_decision',
      source_decision_id: decision.request_id,
      source_record: decision,
      real_outcome: real,
      reward: real.reward,
      result: real.status,
      selected_capability_id: selected,
      evidence_refs: asArray(decision.evidence_refs),
      failure_signature: decision.request && decision.request.task_type || decision.task_type || null,
      action_tier: null,
      trigger_conflict: asArray(decision.rejected).length > 0,
      recorded_at: real.observed_at || decision.recorded_at || null
    };
    row.boundary = boundaryFor(row, boundaryContext);
    records.push(row); counts.routing_decisions += 1;
  }
  for (const usage of usageRecords) {
    const real = usage && usage.outcome;
    if (!real || !real.status) continue;
    const row = {
      source_type: 'usage_record',
      source_decision_id: usage.source_decision_id || usage.run_id,
      source_record: usage,
      real_outcome: { source: 'runner-usage', status: real.status, reward: outcomeReward(real.status), cost: numberOrNull(usage.cost_usd), tokens: usage.tokens && numberOrNull(usage.tokens.total), observed_at: usage.observed_at || null },
      reward: outcomeReward(real.status),
      result: real.status,
      skill_invoked: usage.skill_invoked === true,
      action_tier: null,
      trigger_conflict: false,
      recorded_at: usage.observed_at || null
    };
    row.boundary = boundaryFor(row, boundaryContext);
    records.push(row); counts.usage_records += 1;
  }
  for (const transition of transitions) {
    const real = transition.outcome || transition.evidence && transition.evidence.outcome || null;
    if (!real || !real.status) continue;
    const row = {
      source_type: 'transition',
      source_decision_id: transition.id || transition.candidate_id,
      source_record: transition,
      real_outcome: { source: 'transition', status: real.status, reward: outcomeReward(real.status), cost: null, tokens: null, observed_at: transition.at || null },
      reward: outcomeReward(real.status),
      result: real.status,
      action_tier: transition.action_tier || null,
      trigger_conflict: false,
      recorded_at: transition.at || null
    };
    row.boundary = boundaryFor(row, boundaryContext);
    records.push(row); counts.transitions += 1;
  }
  return { records: records, counts: counts, excluded: { transitions_without_real_outcome: transitions.length - counts.transitions } };
}
function replayMechanismStreak(records, options) {
  const minPasses = Math.max(1, Number(options && options.min_passes || 3));
  const groups = {};
  for (const record of records.filter(function (item) { return item.source_type === 'mechanism_run'; })) {
    const key = record.mechanism_id + '|' + record.case_id;
    (groups[key] = groups[key] || []).push(record);
  }
  const details = [];
  let baselinePass = 0, candidatePass = 0, escapes = 0, tightening = 0;
  for (const list of Object.values(groups)) {
    list.sort(function (a, b) { return Date.parse(a.recorded_at || 0) - Date.parse(b.recorded_at || 0); });
    let streak = 0;
    for (const record of list) {
      const incumbent = record.result === 'pass';
      if (incumbent) streak += 1; else streak = 0;
      const candidate = incumbent && streak >= minPasses;
      if (incumbent) baselinePass += 1;
      if (candidate) candidatePass += 1;
      if (!incumbent && candidate) escapes += 1;
      if (incumbent && !candidate) tightening += 1;
      if (incumbent !== candidate) details.push({ source_decision_id: record.source_decision_id, source_type: record.source_type, incumbent: incumbent, candidate: candidate, boundary: record.boundary, real_outcome: record.real_outcome, reward: record.reward, cost: record.real_outcome.cost, tokens: record.real_outcome.tokens });
    }
  }
  return { policy: 'mechanism-streak', min_passes: minPasses, baseline_pass_count: baselinePass, candidate_pass_count: candidatePass, replay_escape_count: escapes, tightening_rejection_count: tightening, replay_mismatch_count: details.length, details: details, insufficient_real_stream: baselinePass === 0 && details.length === 0 && Object.keys(groups).length === 0 };
}
function replayRoutingEvidence(records) {
  const list = records.filter(function (item) { return item.source_type === 'routing_decision'; });
  const details = [];
  let baselinePass = 0, candidatePass = 0, escapes = 0, tightening = 0;
  for (const record of list) {
    const incumbent = true;
    const candidate = record.evidence_refs.length > 0;
    baselinePass += 1;
    if (candidate) candidatePass += 1;
    if (!incumbent && candidate) escapes += 1;
    if (incumbent && !candidate) tightening += 1;
    if (incumbent !== candidate) details.push({ source_decision_id: record.source_decision_id, source_type: record.source_type, incumbent: incumbent, candidate: candidate, boundary: record.boundary, real_outcome: record.real_outcome, reward: record.reward, cost: record.real_outcome.cost, tokens: record.real_outcome.tokens });
  }
  return { policy: 'routing-evidence-required', baseline_pass_count: baselinePass, candidate_pass_count: candidatePass, replay_escape_count: escapes, tightening_rejection_count: tightening, replay_mismatch_count: details.length, details: details, insufficient_real_stream: list.length === 0 };
}
function replaySkillRequired(records) {
  const list = records.filter(function (item) { return item.source_type === 'usage_record'; });
  const details = [];
  let baselinePass = 0, candidatePass = 0, escapes = 0, tightening = 0;
  for (const item of list) {
    const incumbent = true;
    const candidate = item.skill_invoked === true && item.real_outcome.status === 'success';
    baselinePass += 1;
    if (candidate) candidatePass += 1;
    if (!incumbent && candidate) escapes += 1;
    if (incumbent && !candidate) tightening += 1;
    if (incumbent !== candidate) details.push({ source_decision_id: item.source_decision_id, source_type: item.source_type, incumbent: incumbent, candidate: candidate, boundary: item.boundary, real_outcome: item.real_outcome, reward: item.reward, cost: item.real_outcome.cost, tokens: item.real_outcome.tokens });
  }
  return { policy: 'skill-required', baseline_pass_count: baselinePass, candidate_pass_count: candidatePass, replay_escape_count: escapes, tightening_rejection_count: tightening, replay_mismatch_count: details.length, details: details, insufficient_real_stream: list.length === 0 };
}
function replayCountHalf(records, options) {
  const ratio = Number(options && options.ratio || 0.5);
  const eligible = records.filter(function (item) { return Number.isInteger(item.count_before) && Number.isInteger(item.count_after); });
  if (!eligible.length) return { policy: 'count-half', ratio: ratio, eligible_record_count: 0, replay_escape_count: null, tightening_rejection_count: null, replay_mismatch_count: null, details: [], insufficient_real_stream: true };
  let escapes = 0, tightening = 0;
  const details = [];
  for (const item of eligible) {
    const incumbent = item.count_after < item.count_before;
    const candidate = item.count_after < item.count_before / ratio;
    if (!incumbent && candidate) escapes += 1;
    if (incumbent && !candidate) tightening += 1;
    if (incumbent !== candidate) details.push({ source_decision_id: item.source_decision_id, incumbent: incumbent, candidate: candidate, boundary: item.boundary, real_outcome: item.real_outcome, reward: item.reward });
  }
  return { policy: 'count-half', ratio: ratio, eligible_record_count: eligible.length, replay_escape_count: escapes, tightening_rejection_count: tightening, replay_mismatch_count: details.length, details: details, insufficient_real_stream: false };
}
function boundaryCases(records, topK) {
  return records.filter(function (item) { return item.boundary && item.boundary.selected; }).sort(function (a, b) { return b.boundary.score - a.boundary.score; }).slice(0, Math.max(1, Number(topK || 10))).map(function (item) {
    return { source_decision_id: item.source_decision_id, source_type: item.source_type, boundary_classes: item.boundary.classes, boundary_score: item.boundary.score, real_outcome_status: item.real_outcome.status, real_outcome_reward: item.real_outcome.reward };
  });
}
function replayHistory(input, options) {
  const opts = options || {};
  const context = { previous_results: [], failure_signatures: {} };
  for (const run of recordsOf(input.mechanism_runs)) {
    const key = run.counterexample && run.counterexample.kind;
    if (run.result === 'fail' && key) context.failure_signatures[key] = (context.failure_signatures[key] || 0) + 1;
  }
  const built = buildReplayRecords(input, context);
  const policyReports = [replayMechanismStreak(built.records, opts), replayRoutingEvidence(built.records), replaySkillRequired(built.records), replayCountHalf(built.records, opts)];
  const allDetails = policyReports.reduce(function (sum, item) { return sum.concat(item.details || []); }, []);
  const mismatches = allDetails.filter(function (item) { return item.incumbent !== item.candidate; });
  const boundaryBySource = {};
  for (const item of built.records) boundaryBySource[item.source_decision_id] = item;
  for (const item of mismatches) {
    const record = boundaryBySource[item.source_decision_id];
    if (!record) continue;
    const classes = Array.from(new Set((record.boundary.classes || []).concat(['near_pass_fail'])));
    record.boundary = { classes: classes, score: classes.length / 5, selected: true };
    item.boundary = record.boundary;
  }
  const boundaryHits = mismatches.filter(function (item) { return item.boundary && item.boundary.selected; }).length;
  const outcomeGain = allDetails.reduce(function (sum, item) { return sum + ((item.candidate ? item.reward : 0) - (item.incumbent ? item.reward : 0)); }, 0);
  const acceptedUsage = built.records.filter(function (item) { return item.source_type === 'usage_record' && item.skill_invoked === true && item.real_outcome.status === 'success'; });
  const costs = acceptedUsage.map(function (item) { return item.real_outcome.cost; }).filter(function (value) { return Number.isFinite(value); });
  const tokens = acceptedUsage.map(function (item) { return item.real_outcome.tokens; }).filter(function (value) { return Number.isFinite(value); });
  const candidateAccepted = acceptedUsage.length;
  const closedCases = candidateAccepted;
  const enough = policyReports.some(function (item) { return !item.insufficient_real_stream; });
  const hardFailure = policyReports.reduce(function (sum, item) { return sum + (item.replay_escape_count || 0); }, 0) !== 0;
  const contextBudget = opts.context_budget || null;
  const contextEscape = contextBudget && Number.isInteger(contextBudget.context_budget_escape_count) ? contextBudget.context_budget_escape_count : null;
  const costPerOutcome = costs.length && candidateAccepted ? costs.reduce(function (a, b) { return a + b; }, 0) / candidateAccepted : null;
  const tokenPerClosed = tokens.length && closedCases ? tokens.reduce(function (a, b) { return a + b; }, 0) / closedCases : null;
  return {
    schema_version: 'autoarmory/history-replay/v1',
    stream_counts: built.counts,
    excluded: built.excluded,
    policy_reports: policyReports,
    boundary_cases: boundaryCases(built.records, opts.top_k),
    metrics: enough ? {
      replay_escape_count: policyReports.reduce(function (sum, item) { return sum + (item.replay_escape_count || 0); }, 0),
      tightening_rejection_count: policyReports.reduce(function (sum, item) { return sum + (item.tightening_rejection_count || 0); }, 0),
      outcome_gain: outcomeGain,
      cost_per_outcome: costPerOutcome,
      boundary_hit_rate: mismatches.length ? Number((boundaryHits / mismatches.length).toFixed(4)) : null,
      unwanted_agent_wakeups: policyReports.reduce(function (sum, item) { return sum + (item.tightening_rejection_count || 0); }, 0),
      token_cost_per_closed_case: tokenPerClosed
    } : null,
    cost_status: costPerOutcome === null && tokenPerClosed === null ? 'insufficient_cost_stream' : 'observed',
    context_budget: contextBudget,
    synthetic_record_count: 0,
    llm_judge_calls: 0,
    insufficient_real_stream: !enough,
    strategy_verdict: enough ? (hardFailure ? 'candidate_escalation' : 'candidate_observed') : 'insufficient_real_stream',
    promotion: false
  };
}
module.exports = { buildReplayRecords, replayHistory, boundaryCases, outcomeReward };