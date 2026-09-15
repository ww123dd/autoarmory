'use strict';

function arr(value) { return Array.isArray(value) ? value : []; }
function num(value, fallback) { const n = Number(value); return Number.isFinite(n) ? n : (fallback || 0); }

function cohenKappa(pairs) {
  const list = arr(pairs).filter(function (pair) { return pair && pair.human !== undefined && pair.judge !== undefined; });
  const categories = Array.from(new Set(list.flatMap(function (pair) { return [String(pair.human), String(pair.judge)]; })));
  const total = list.length;
  if (!total) return { kappa: null, observed: 0, expected: 0, total: 0, categories };
  const matrix = {};
  for (const a of categories) { matrix[a] = {}; for (const b of categories) matrix[a][b] = 0; }
  for (const pair of list) matrix[String(pair.human)][String(pair.judge)] += 1;
  let observed = 0;
  for (const a of categories) observed += matrix[a][a];
  const observedAgreement = observed / total;
  let expectedAgreement = 0;
  for (const category of categories) {
    let human = 0;
    let judge = 0;
    for (const other of categories) { human += matrix[category][other]; judge += matrix[other][category]; }
    expectedAgreement += (human / total) * (judge / total);
  }
  const kappa = expectedAgreement === 1 ? 1 : (observedAgreement - expectedAgreement) / (1 - expectedAgreement);
  return { kappa, observed: observedAgreement, expected: expectedAgreement, total, categories, matrix };
}

function calibrate(pairs) {
  const result = cohenKappa(pairs);
  let quality = 'unusable';
  if (result.kappa !== null && result.kappa >= 0.8) quality = 'trusted';
  else if (result.kappa !== null && result.kappa >= 0.6) quality = 'cautious';
  return Object.assign({ schema_version: 'skillcanary/grader-calibration/v1', quality, threshold: { trusted: 0.8, cautious: 0.6 } }, result);
}

function ensemble(results) {
  const list = arr(results);
  const votes = list.map(function (item) { return item && (item.pass === true || item.verdict === 'pass' || item.score >= 0.5); });
  const passVotes = votes.filter(Boolean).length;
  const total = votes.length;
  const weighted = list.reduce(function (sum, item) { return sum + (item && Number.isFinite(Number(item.weight)) ? Number(item.weight) : 1); }, 0);
  const passWeight = list.reduce(function (sum, item, index) { return sum + (votes[index] ? (Number.isFinite(Number(item.weight)) ? Number(item.weight) : 1) : 0); }, 0);
  const pass = weighted ? passWeight > weighted / 2 : false;
  return { pass, votes: passVotes, total, pass_weight: passWeight, total_weight: weighted, disagreement: total ? Math.min(passVotes, total - passVotes) / total : 0 };
}

function plan(step) {
  const input = step || {};
  const risk = String(input.risk || 'low').toLowerCase();
  const openEnded = input.open_ended === true || input.openEnded === true;
  const deterministic = input.deterministic === true || input.exact_match === true;
  const hasSchema = input.schema !== undefined || input.json_schema !== undefined;
  const highRisk = risk === 'high' || risk === 'critical';
  const requiresHuman = input.requires_human === true || input.human_approval === true || (highRisk && input.irreversible === true);
  if (requiresHuman) return { grader: 'human', reason: 'irreversible or explicitly human-controlled', calibration_required: false, allow_unknown: true };
  if (deterministic || hasSchema) return { grader: 'deterministic', reason: deterministic ? 'exact or deterministic check' : 'schema validation', calibration_required: false, allow_unknown: false };
  if (!openEnded) return { grader: 'rules', reason: 'bounded, rule-checkable behavior', calibration_required: false, allow_unknown: true };
  return { grader: 'llm_ensemble', reason: 'open-ended task requires calibrated semantic judging', calibration_required: true, allow_unknown: true, minimum_kappa: 0.6 };
}

module.exports = { cohenKappa, calibrate, ensemble, plan };
