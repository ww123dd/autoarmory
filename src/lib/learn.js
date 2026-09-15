'use strict';

function summarize(decisions) {
  const groups = {};
  for (const decision of decisions || []) { const action = decision.action || 'unknown'; if (!groups[action]) groups[action] = []; groups[action].push(Number(decision.reward || 0)); }
  return Object.keys(groups).sort().map(function (action) { const values = groups[action]; return { action, count: values.length, mean_reward: values.reduce(function (a, b) { return a + b; }, 0) / values.length }; });
}
function recommend(decisions) { return summarize(decisions).slice().sort(function (a, b) { return b.mean_reward - a.mean_reward; })[0] || null; }
module.exports = { summarize, recommend };
