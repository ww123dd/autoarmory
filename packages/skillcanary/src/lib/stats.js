'use strict';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce(function (a, b) { return a + b; }, 0) / values.length;
}

function variance(values) {
  if (values.length < 2) return 0;
  const m = mean(values);
  return values.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / values.length;
}

function stddev(values) {
  return Math.sqrt(variance(values));
}

function quantile(values, q) {
  if (!values.length) return 0;
  const sorted = values.slice().sort(function (a, b) { return a - b; });
  const position = (sorted.length - 1) * q;
  const base = Math.floor(position);
  const rest = position - base;
  if (sorted[base + 1] === undefined) return sorted[base];
  return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
}

function sigmoid(value) {
  if (value >= 0) return 1 / (1 + Math.exp(-value));
  const exp = Math.exp(value);
  return exp / (1 + exp);
}

function makeRng(seed) {
  let state = (Number(seed) || 1) >>> 0;
  return function () {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleBeta(alpha, beta, rng) {
  const a = Number(alpha);
  const b = Number(beta);
  if (!(a > 0) || !(b > 0)) throw new Error('alpha and beta must be > 0');
  const x = sampleGamma(a, 1, rng);
  const y = sampleGamma(b, 1, rng);
  const sum = x + y;
  return Number.isFinite(sum) && sum > 0 ? x / sum : 0.5;
}

function sampleGamma(shape, scale, rng) {
  const sh = Number(shape);
  const sc = Number(scale);
  if (!(sh > 0) || !(sc > 0)) throw new Error('shape and scale must be > 0');
  if (sh < 1) {
    const u = Math.max(rng(), Number.EPSILON);
    return sampleGamma(sh + 1, sc, rng) * Math.pow(u, 1 / sh);
  }
  const d = sh - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x;
    let v;
    do { x = boxMuller(rng); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v * sc;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v * sc;
  }
}

function boxMuller(rng) {
  const u = Math.max(rng(), Number.EPSILON);
  const v = Math.max(rng(), Number.EPSILON);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function ucbScore(value, count, total, exploration) {
  if (count <= 0) return Number.POSITIVE_INFINITY;
  const c = exploration === undefined ? 2 : Number(exploration);
  return value + Math.sqrt((c * Math.log(Math.max(1, total) + 1)) / count);
}

function betaPosterior(values, priorAlpha, priorBeta) {
  let alpha = priorAlpha === undefined ? 1 : priorAlpha;
  let beta = priorBeta === undefined ? 1 : priorBeta;
  for (const value of values) {
    const unit = clamp(Number(value), 0, 1);
    alpha += unit;
    beta += 1 - unit;
  }
  return { alpha, beta, mean: alpha / (alpha + beta) };
}

function cusum(values, options) {
  const opts = options || {};
  const threshold = opts.threshold === undefined ? 5 : Number(opts.threshold);
  const drift = opts.drift === undefined ? 0.5 : Number(opts.drift);
  const baseline = opts.baseline === undefined ? mean(values.slice(0, Math.min(values.length, opts.baselineWindow || 5))) : Number(opts.baseline);
  let positive = 0;
  let negative = 0;
  let max = 0;
  let index = -1;
  for (let i = 0; i < values.length; i++) {
    const delta = Number(values[i]) - baseline - drift;
    positive = Math.max(0, positive + delta);
    negative = Math.min(0, negative + delta);
    const score = Math.max(positive, Math.abs(negative));
    if (score > max) { max = score; index = i; }
  }
  return { detected: max >= threshold, score: max, index, baseline, threshold };
}

function paretoFrontier(items, objectives) {
  const specs = Array.isArray(objectives) ? objectives : [];
  return items.filter(function (item) {
    return !items.some(function (other) {
      if (other === item) return false;
      let strictlyBetter = false;
      for (const spec of specs) {
        const direction = spec.direction === 'min' ? -1 : 1;
        const a = direction * Number(item.objectives && item.objectives[spec.key] || 0);
        const b = direction * Number(other.objectives && other.objectives[spec.key] || 0);
        if (b < a) return false;
        if (b > a) strictlyBetter = true;
      }
      return strictlyBetter;
    });
  });
}

module.exports = {
  clamp,
  mean,
  variance,
  stddev,
  quantile,
  sigmoid,
  makeRng,
  sampleBeta,
  ucbScore,
  betaPosterior,
  cusum,
  paretoFrontier
};
