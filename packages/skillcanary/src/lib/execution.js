'use strict';

const reliability = require('./reliability');

function arr(value) { return Array.isArray(value) ? value : []; }
function num(value, fallback) { const n = Number(value); return Number.isFinite(n) ? n : (fallback || 0); }

function recommendMode(step) {
  const input = step || {};
  const risk = String(input.risk || 'low').toLowerCase();
  const irreversible = input.irreversible === true;
  const amount = num(input.amount, 0);
  const limit = num(input.amount_limit || input.limit, Infinity);
  if (input.requires_human === true || (risk !== 'low' && irreversible) || amount > limit) {
    return { mode: 'human_approval', reason: 'high-risk, irreversible or above approval limit' };
  }
  if (input.open_ended === true || input.openEnded === true) {
    return { mode: 'agent', reason: 'open-ended exploration or generation' };
  }
  if (input.known_next === true && arr(input.branches).length === 0) {
    return { mode: 'deterministic', reason: 'next step is known and branch-free' };
  }
  return { mode: 'workflow', reason: 'bounded branching with explicit control flow' };
}

function auditWorkflow(workflow) {
  const steps = arr(workflow && workflow.steps).map(function (step, index) {
    const recommendation = recommendMode(step);
    const declared = step.mode || step.execution_mode || 'unknown';
    const issues = [];
    if (declared !== 'unknown' && declared !== recommendation.mode) issues.push('declared ' + declared + ' but recommended ' + recommendation.mode);
    if (declared === 'agent' && step.known_next === true && arr(step.branches).length === 0) issues.push('agent used for a known branch-free step');
    if (declared === 'agent' && String(step.risk || '').toLowerCase() === 'high') issues.push('high-risk step uses unconstrained agent mode');
    return {
      id: step.id || 'step-' + (index + 1),
      declared_mode: declared,
      recommended_mode: recommendation.mode,
      reason: recommendation.reason,
      success_probability: Math.max(0, Math.min(1, num(step.success_probability, 1))),
      issues
    };
  });
  const cascade = reliability.compositeReliability(steps);
  const issueCount = steps.reduce(function (sum, step) { return sum + step.issues.length; }, 0);
  return {
    schema_version: 'skillcanary/execution-plan/v1',
    steps,
    cascade_reliability: cascade,
    issues: steps.flatMap(function (step) { return step.issues.map(function (issue) { return step.id + ': ' + issue; }); }),
    agent_overuse_score: issueCount / Math.max(1, steps.length),
    verdict: issueCount ? 'REVIEW' : 'PASS'
  };
}

module.exports = { recommendMode, auditWorkflow };
