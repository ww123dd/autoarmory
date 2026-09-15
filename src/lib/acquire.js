'use strict';

const SEVERITY = { low: 1, medium: 2, high: 4, critical: 8 };
function num(value, fallback) { const n = Number(value); return Number.isFinite(n) ? n : (fallback || 0); }

function score(candidate, uncertainty) {
  const severity = SEVERITY[String(candidate.severity || 'medium').toLowerCase()] || 2;
  const risk = String(candidate.risk || 'medium').toLowerCase();
  const riskPenalty = risk === 'high' ? 3 : (risk === 'medium' ? 1 : 0);
  return severity * 2 + num(candidate.frequency, 1) + num(uncertainty, 0.5) * 3 - riskPenalty;
}

function acquire(candidates, policyResult) {
  const uncertainty = {};
  for (const item of (policyResult && policyResult.recommendations) || []) uncertainty[item.action] = item.uncertainty;
  return (candidates || []).map(function (candidate) {
    return Object.assign({}, candidate, { acquisition_score: score(candidate, uncertainty[candidate.action]) });
  }).sort(function (a, b) { return b.acquisition_score - a.acquisition_score; });
}

module.exports = { acquire, score };
