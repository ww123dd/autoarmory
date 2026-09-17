'use strict';

function recordsOf(report) {
  if (Array.isArray(report)) return report;
  if (!report || typeof report !== 'object') return [];
  return Array.isArray(report.records) ? report.records : (Array.isArray(report.cases) ? report.cases : []);
}
function metric(record, key) {
  return Number(record && record.metrics && record.metrics[key] || 0);
}
function indexById(records) {
  const index = {};
  for (const record of records) if (record && record.id) index[record.id] = record;
  return index;
}
function compareTriggerReports(baseline, candidate, options) {
  const opts = options || {};
  const baseRecords = recordsOf(baseline);
  const nextRecords = recordsOf(candidate);
  const base = indexById(baseRecords);
  const next = indexById(nextRecords);
  const errors = [];
  const requested = Number(opts.min_cases || 3);
  if (baseRecords.length < requested) errors.push('baseline must contain at least ' + requested + ' real requests');
  if (nextRecords.length < requested) errors.push('candidate must contain at least ' + requested + ' real requests');
  const baseIds = Object.keys(base).sort();
  const nextIds = Object.keys(next).sort();
  if (baseIds.join('|') !== nextIds.join('|')) errors.push('baseline and candidate must replay the same request ids');
  const baselineUnwanted = Number(baseline && baseline.metrics && baseline.metrics.unwanted_skill_loads || baseRecords.reduce(function (sum, item) { return sum + metric(item, 'unwanted_skill_loads'); }, 0));
  const candidateUnwanted = Number(candidate && candidate.metrics && candidate.metrics.unwanted_skill_loads || nextRecords.reduce(function (sum, item) { return sum + metric(item, 'unwanted_skill_loads'); }, 0));
  const regressions = [];
  for (const id of baseIds) {
    if (!next[id]) continue;
    const delta = metric(next[id], 'unwanted_skill_loads') - metric(base[id], 'unwanted_skill_loads');
    if (delta > 0) regressions.push({ id: id, delta: delta, baseline: metric(base[id], 'unwanted_skill_loads'), candidate: metric(next[id], 'unwanted_skill_loads') });
  }
  const delta = candidateUnwanted - baselineUnwanted;
  const regressionCount = regressions.length + (baseIds.length - nextIds.filter(function (id) { return !!base[id]; }).length);
  const expected = opts.expect || 'observed';
  const observed = delta > 0 && regressionCount > 0 ? 'positive' : (delta === 0 && regressionCount === 0 ? 'zero' : 'changed');
  const ok = errors.length === 0 && (expected === 'observed' || expected === observed);
  return {
    schema_version: 'autoarmory/trigger-regression/v1',
    baseline_cases: baseRecords.length,
    candidate_cases: nextRecords.length,
    same_requests: baseIds.join('|') === nextIds.join('|'),
    baseline_unwanted_skill_loads: baselineUnwanted,
    candidate_unwanted_skill_loads: candidateUnwanted,
    trigger_misfire_delta: delta,
    trigger_regression_count: regressionCount,
    regressions: regressions,
    expected: expected,
    observed: observed,
    errors: errors,
    ok: ok
  };
}
module.exports = { compareTriggerReports };