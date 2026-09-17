'use strict';

const { makeRng, sampleBeta } = require('../src/lib/sampling');

function must(condition, message) { if (!condition) throw new Error(message); }
const shapes = [0.01, 0.1, 0.3, 0.34, 1, 2];
for (const alpha of shapes) {
  for (let i = 0; i < 200; i++) {
    const value = sampleBeta(alpha, 1, makeRng(i + 1));
    must(Number.isFinite(value), 'sampleBeta(' + alpha + ') must be finite, got ' + value);
    must(value >= 0 && value <= 1, 'sampleBeta(' + alpha + ') must stay in [0,1], got ' + value);
  }
}
for (const pair of [[0.01, 0.01], [0.1, 0.3], [0.3, 2], [2, 0.1]]) {
  const value = sampleBeta(pair[0], pair[1], makeRng(7));
  must(Number.isFinite(value) && value >= 0 && value <= 1, 'boundary pair must be finite and in range: ' + pair.join(','));
}
let refused = 0;
for (const pair of [[0, 1], [-1, 1], [1, 0]]) {
  try { sampleBeta(pair[0], pair[1], makeRng(1)); } catch (_) { refused += 1; }
}
must(refused === 3, 'non-positive alpha/beta must be refused');
must(sampleBeta(0.3, 2, makeRng(42)) === sampleBeta(0.3, 2, makeRng(42)), 'same seed must reproduce');
console.log('sampling boundary tests passed: shapes<1 finite, range bounded, invalid parameters refused');