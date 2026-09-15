'use strict';

function makeRng(seed) {
  let state = (Number(seed) || 1) >>> 0;
  return function () { state += 0x6D2B79F5; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function sampleGamma(shape, rng) {
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x;
    let v;
    do { x = boxMuller(rng); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
function boxMuller(rng) { const u = Math.max(rng(), Number.EPSILON); const v = Math.max(rng(), Number.EPSILON); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function sampleBeta(alpha, beta, rng) { const x = sampleGamma(Math.max(0.0001, alpha), rng); const y = sampleGamma(Math.max(0.0001, beta), rng); return x / (x + y); }

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
