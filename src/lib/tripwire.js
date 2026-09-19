'use strict';
const fs = require('fs');
const path = require('path');
const verify = require('./verify');
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function run(repo, vectorsFile) {
  const root = path.resolve(repo);
  const file = path.resolve(vectorsFile || path.join(root, 'docs', 'evidence', 'tripwire-vectors-v1.json'));
  if (!fs.existsSync(file)) return { schema_version: 'autoarmory/tripwire/v1', ok: false, errors: ['tripwire_vectors_missing'], verifiers: [] };
  const vectors = readJson(file).verifiers || {};
  const lock = readJson(path.join(root, 'verifiers.lock.json'));
  const rows = [];
  for (const id of Object.keys(vectors)) {
    const declared = (lock.verifiers || []).find(function (item) { return item.id === id; });
    if (!declared) { rows.push({ verifier_id: id, passed: false, errors: ['verifier_not_registered'] }); continue; }
    const vector = vectors[id];
    const errors = [];
    const positive = verify.captureRefs([{ id: id + '-tripwire-positive', verifier: id, params: vector.positive.params || { instance: vector.positive.instance } }], { repo: root, trials: 1 });
    if (positive.status !== vector.positive.expect_status) errors.push('positive_status:' + positive.status);
    const positiveFresh = positive.refs && positive.refs[0] && positive.refs[0].fresh;
    if (vector.positive.expect_passed !== undefined && (!positiveFresh || positiveFresh.observed.passed !== vector.positive.expect_passed)) errors.push('positive_passed');
    if (vector.positive.expect_complete !== undefined && (!positiveFresh || positiveFresh.observed.complete !== vector.positive.expect_complete)) errors.push('positive_complete');
    const original = verify.runnerDescriptor(declared);
    const mutated = verify.runnerDescriptor(Object.assign({}, declared, { assertion: Object.assign({}, declared.assertion, { value: vector.drift.assertion_value }) }));
    const driftDetected = original.runner_sha256 !== mutated.runner_sha256;
    if (!driftDetected) errors.push('drift_not_detected');
    let negativeStatus = 'drift_vector';
    if (vector.negative) {
      const negative = verify.captureRefs([{ id: id + '-tripwire-negative', verifier: id, params: vector.negative.params || { instance: vector.negative.instance } }], { repo: root, trials: 1 });
      negativeStatus = negative.status;
      if (negative.status !== vector.negative.expect_status) errors.push('negative_status:' + negative.status);
    }
    rows.push({ verifier_id: id, passed: errors.length === 0, errors: errors, positive_status: positive.status, negative_status: negativeStatus, drift_sha256: mutated.runner_sha256 });
  }
  return { schema_version: 'autoarmory/tripwire/v1', generated_at: new Date().toISOString(), vectors_file: file, ok: rows.length > 0 && rows.every(function (row) { return row.passed; }), verifiers: rows };
}
module.exports = { run };