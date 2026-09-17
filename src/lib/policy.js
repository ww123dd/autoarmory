'use strict';

const { makeRng, sampleBeta } = require('./sampling');

function recommend(decisions, options) {
  const opts = options || {};
  const groups = {};
  for (const decision of decisions || []) {
    const action = decision.action || 'unknown';
    if (!groups[action]) groups[action] = [];
    groups[action].push(decision);
  }
  const rng = makeRng(opts.seed || 1);
  const results = Object.keys(groups).map(function (action) {
    const list = groups[action];
    const rewards = list.map(function (decision) { return Number(decision.reward || 0); });
    const unit = rewards.map(function (reward) { return 1 / (1 + Math.exp(-reward)); });
    const alpha = 1 + unit.reduce(function (a, b) { return a + b; }, 0);
    const beta = 1 + unit.reduce(function (a, b) { return a + (1 - b); }, 0);
    const score = sampleBeta(alpha, beta, rng);
    return { action, count: list.length, mean_reward: rewards.reduce(function (a, b) { return a + b; }, 0) / rewards.length, alpha, beta, score, uncertainty: Math.sqrt((alpha * beta) / ((alpha + beta) * (alpha + beta) * (alpha + beta + 1))) };
  }).sort(function (a, b) { return b.score - a.score; });
  return { schema_version: 'selfforge/policy/v1', algorithm: 'thompson', recommendations: results };
}

module.exports = { recommend };
