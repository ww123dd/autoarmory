'use strict';

function arr(value) { return Array.isArray(value) ? value : []; }
function num(value, fallback) { const n = Number(value); return Number.isFinite(n) ? n : (fallback || 0); }
function unique(values) { return Array.from(new Set(values.filter(function (value) { return value !== undefined && value !== null; }))); }

function ratio(numerator, denominator, fallback) {
  if (!denominator) return fallback === undefined ? 0 : fallback;
  return numerator / denominator;
}

function toolSelectionMetrics(expectedTools, actualTools) {
  const expected = unique(arr(expectedTools));
  const actual = unique(arr(actualTools));
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const truePositive = actual.filter(function (tool) { return expectedSet.has(tool); }).length;
  const falsePositive = actual.filter(function (tool) { return !expectedSet.has(tool); }).length;
  const falseNegative = expected.filter(function (tool) { return !actualSet.has(tool); }).length;
  const precision = ratio(truePositive, truePositive + falsePositive, expected.length === 0 && actual.length === 0 ? 1 : 0);
  const recall = ratio(truePositive, truePositive + falseNegative, expected.length === 0 ? 1 : 0);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { expected, actual, true_positive: truePositive, false_positive: falsePositive, false_negative: falseNegative, precision, recall, f1, pass: f1 === 1 };
}

function parameterExtraction(expected, actual) {
  const expectedObject = expected || {};
  const actualObject = actual || {};
  const keys = unique(Object.keys(expectedObject).concat(Object.keys(actualObject)));
  const mismatches = [];
  for (const key of keys) {
    if (JSON.stringify(expectedObject[key]) !== JSON.stringify(actualObject[key])) {
      mismatches.push({ key, expected: expectedObject[key], actual: actualObject[key] });
    }
  }
  const total = keys.length;
  return { total, passed: total - mismatches.length, pass_rate: ratio(total - mismatches.length, total, 1), mismatches, pass: mismatches.length === 0 };
}

function resultUtilization(toolResults, finalAnswer, fields) {
  const chosen = arr(fields);
  const text = typeof finalAnswer === 'string' ? finalAnswer : JSON.stringify(finalAnswer || {});
  const values = [];
  for (const result of arr(toolResults)) {
    const source = result && (result.data || result.result || result.output || result);
    if (!source || typeof source !== 'object') continue;
    for (const field of chosen) if (source[field] !== undefined) values.push(source[field]);
  }
  const uniqueValues = unique(values.map(function (value) { return typeof value === 'string' ? value : JSON.stringify(value); }));
  const used = uniqueValues.filter(function (value) { return text.indexOf(value) !== -1; });
  return { fields: chosen, available: uniqueValues.length, used: used.length, utilization: ratio(used.length, uniqueValues.length, 1), pass: uniqueValues.length === 0 || used.length === uniqueValues.length };
}

function errorRecovery(events) {
  const list = arr(events);
  const hadError = list.some(function (event) { return event && (event.error || /error|fail|timeout/i.test(String(event.status || event.type || ''))); });
  if (!hadError) return { class: 'none', recovered: true, hallucinated_success: false, pass: true };
  const retry = list.some(function (event) { return /retry/i.test(String(event.type || event.action || '')); });
  const fallback = list.some(function (event) { return /fallback|degrad/i.test(String(event.type || event.action || '')); });
  const escalate = list.some(function (event) { return /escalat|human|approval/i.test(String(event.type || event.action || '')); });
  const claimedSuccess = list.some(function (event) { return event && (event.success === true || /success|completed/i.test(String(event.status || event.type || ''))); });
  let cls = 'unresolved';
  if (retry) cls = 'retry';
  if (fallback) cls = 'fallback';
  if (escalate) cls = 'escalate';
  const hallucinated = claimedSuccess && !retry && !fallback && !escalate;
  if (hallucinated) cls = 'hallucinated_success';
  return { class: cls, retry, fallback, escalate, recovered: retry || fallback || escalate, hallucinated_success: hallucinated, pass: !hallucinated };
}

function planCoherence(spans, options) {
  const opts = options || {};
  const maxSteps = num(opts.maxSteps, 50);
  const maxDepth = num(opts.maxDepth, 10);
  const list = arr(spans);
  const ids = list.map(function (span, index) { return span && (span.id || span.span_id) || 'span-' + index; });
  const counts = {};
  for (const id of ids) counts[id] = (counts[id] || 0) + 1;
  const duplicates = Object.keys(counts).filter(function (id) { return counts[id] > 1; });
  const depth = list.reduce(function (max, span) { return Math.max(max, num(span && (span.depth || span.level), 0)); }, 0);
  const errors = [];
  if (list.length > maxSteps) errors.push('step budget exceeded');
  if (depth > maxDepth) errors.push('depth budget exceeded');
  if (duplicates.length) errors.push('repeated node: ' + duplicates.join(','));
  return { steps: list.length, depth, duplicates, max_steps: maxSteps, max_depth: maxDepth, pass: errors.length === 0, errors };
}

function taskCompletion(subgoals) {
  const goals = arr(subgoals).map(function (goal) {
    return { id: goal.id || goal.name || 'goal', weight: num(goal.weight, 1), passed: goal.passed === true, critical: goal.critical === true };
  });
  const totalWeight = goals.reduce(function (sum, goal) { return sum + goal.weight; }, 0);
  const passedWeight = goals.filter(function (goal) { return goal.passed; }).reduce(function (sum, goal) { return sum + goal.weight; }, 0);
  const criticalFailure = goals.some(function (goal) { return goal.critical && !goal.passed; });
  return { total: goals.length, passed: goals.filter(function (goal) { return goal.passed; }).length, score: ratio(passedWeight, totalWeight, 1), critical_failure: criticalFailure, pass: !criticalFailure && passedWeight === totalWeight };
}

function computeMetrics(trace) {
  const input = trace || {};
  const toolSelection = toolSelectionMetrics(input.expected_tools, input.actual_tools);
  const parameters = parameterExtraction(input.expected_parameters, input.actual_parameters);
  const utilization = resultUtilization(input.tool_results, input.final_answer, input.utilization_fields);
  const recovery = errorRecovery(input.events || input.spans);
  const plan = planCoherence(input.spans, input.plan_options);
  const completion = taskCompletion(input.subgoals);
  const pass = toolSelection.pass && parameters.pass && utilization.pass && recovery.pass && plan.pass && completion.pass;
  return {
    schema_version: 'skillcanary/metrics/v1',
    task_id: input.task_id || input.id || 'task',
    trial_id: input.trial_id || 'trial',
    tool_selection: toolSelection,
    parameter_extraction: parameters,
    result_utilization: utilization,
    error_recovery: recovery,
    plan_coherence: plan,
    task_completion: completion,
    pass
  };
}

module.exports = {
  toolSelectionMetrics,
  parameterExtraction,
  resultUtilization,
  errorRecovery,
  planCoherence,
  taskCompletion,
  computeMetrics
};
