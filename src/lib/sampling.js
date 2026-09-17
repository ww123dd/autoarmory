'use strict';

function makeRng(seed) {
  let state = (Number(seed) || 1) >>> 0;
  return function () { state += 0x6D2B79F5; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function boxMuller(rng) { const u = Math.max(rng(), Number.EPSILON); const v = Math.max(rng(), Number.EPSILON); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function sampleGamma(shape, rng) {
  const s = Number(shape);
  if (!(s > 0)) throw new Error('shape must be > 0');
  if (s < 1) {
    const u = Math.max(rng(), Number.EPSILON);
    return sampleGamma(s + 1, rng) * Math.pow(u, 1 / s);
  }
  const d = s - 1 / 3;
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
function sampleBeta(alpha, beta, rng) {
  const a = Number(alpha);
  const b = Number(beta);
  if (!(a > 0) || !(b > 0)) throw new Error('alpha and beta must be > 0');
  const x = sampleGamma(a, rng);
  const y = sampleGamma(b, rng);
  const sum = x + y;
  return Number.isFinite(sum) && sum > 0 ? x / sum : 0.5;
}

module.exports = { makeRng, boxMuller, sampleGamma, sampleBeta };
