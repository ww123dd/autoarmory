'use strict';

const { sha256 } = require('./util');

function recordsOf(input) {
  if (Array.isArray(input)) return input;
  if (input && Array.isArray(input.records)) return input.records;
  return [];
}
function groupRuns(records) {
  const groups = {};
  for (const record of records || []) {
    const key = String(record && record.mechanism_id || '') + '|' + String(record && record.case_id || '');
    if (!groups[key]) groups[key] = [];
    groups[key].push(record);
  }
  for (const list of Object.values(groups)) {
    list.sort(function (a, b) { return Date.parse(a.finished_at || a.recorded_at || 0) - Date.parse(b.finished_at || b.recorded_at || 0); });
  }
  return groups;
}
function compareVerdicts(records, baseline, candidate) {
  let replayEscapeCount = 0;
  let tighteningRejectionCount = 0;
  let replayMismatchCount = 0;
  const details = [];
  for (let index = 0; index < records.length; index++) {
    const accepted = !!baseline(records[index], index);
    const proposed = !!candidate(records[index], index);
    if (!accepted && proposed) replayEscapeCount += 1;
    if (accepted && !proposed) tighteningRejectionCount += 1;
    if (accepted !== proposed) {
      replayMismatchCount += 1;
      details.push({ index: index, run_id: records[index] && records[index].id || null, incumbent: accepted, candidate: proposed });
    }
  }
  return {
    replay_escape_count: replayEscapeCount,
    tightening_rejection_count: tighteningRejectionCount,
    replay_mismatch_count: replayMismatchCount,
    details: details
  };
}
function replayMechanismStreak(input, options) {
  const opts = options || {};
  const records = recordsOf(input);
  const minPasses = Math.max(1, Number(opts.min_passes || 3));
  let baselinePass = 0;
  let candidatePass = 0;
  const comparisons = [];
  for (const list of Object.values(groupRuns(records))) {
    let streak = 0;
    for (const record of list) {
      const incumbent = record && record.result === 'pass';
      if (incumbent) streak += 1; else streak = 0;
      const candidate = incumbent && streak >= minPasses;
      if (incumbent) baselinePass += 1;
      if (candidate) candidatePass += 1;
      comparisons.push({ record: record, incumbent: incumbent, candidate: candidate });
    }
  }
  const compared = compareVerdicts(comparisons.map(function (item) { return item.record; }), function (_, index) { return comparisons[index].incumbent; }, function (_, index) { return comparisons[index].candidate; });
  return {
    schema_version: 'autoarmory/replay-report/v1',
    policy: 'mechanism-streak',
    min_passes: minPasses,
    record_count: records.length,
    baseline_pass_count: baselinePass,
    candidate_pass_count: candidatePass,
    replay_escape_count: compared.replay_escape_count,
    tightening_rejection_count: compared.tightening_rejection_count,
    replay_mismatch_count: compared.replay_mismatch_count,
    insufficient_real_stream: records.length === 0,
    details: compared.details
  };
}
function countsFrom(record) {
  const observed = record && record.counterexample && record.counterexample.observed;
  const evidence = record && record.evidence;
  const before = record && record.count_before !== undefined ? record.count_before : (record && record.before !== undefined ? record.before : (evidence && evidence.count_before !== undefined ? evidence.count_before : (observed && observed.count_before)));
  const after = record && record.count_after !== undefined ? record.count_after : (record && record.after !== undefined ? record.after : (evidence && evidence.count_after !== undefined ? evidence.count_after : (observed && observed.count_after)));
  return { before: before, after: after };
}
function replayCountHalf(input, options) {
  const opts = options || {};
  const records = recordsOf(input);
  const ratio = Number(opts.ratio || 0.5);
  const eligible = records.map(countsFrom).filter(function (item) { return Number.isInteger(item.before) && Number.isInteger(item.after); });
  if (eligible.length === 0) {
    return {
      schema_version: 'autoarmory/replay-report/v1',
      policy: 'count-half',
      ratio: ratio,
      record_count: records.length,
      eligible_record_count: 0,
      insufficient_real_stream: true,
      replay_escape_count: null,
      tightening_rejection_count: null,
      replay_mismatch_count: null,
      details: []
    };
  }
  const compared = compareVerdicts(eligible, function (item) { return item.after < item.before; }, function (item) { return item.after < item.before / 2; });
  return Object.assign({
    schema_version: 'autoarmory/replay-report/v1',
    policy: 'count-half',
    ratio: ratio,
    record_count: records.length,
    eligible_record_count: eligible.length,
    insufficient_real_stream: false
  }, compared);
}
function replay(input, policy, options) {
  const name = policy || 'mechanism-streak';
  if (name === 'count-half' || name === 'count-ratio') return replayCountHalf(input, options);
  if (name === 'mechanism-streak') return replayMechanismStreak(input, options);
  return { schema_version: 'autoarmory/replay-report/v1', policy: name, insufficient_real_stream: true, replay_escape_count: null, tightening_rejection_count: null, replay_mismatch_count: null, errors: ['unknown replay policy: ' + name] };
}
function sourceSha256(text) { return sha256(String(text || '')); }
module.exports = { recordsOf, replayMechanismStreak, replayCountHalf, replay, compareVerdicts, sourceSha256 };