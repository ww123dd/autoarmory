'use strict';
const fs = require('fs');
const path = require('path');
const { readJsonl } = require('./util');
const { resolveClaim } = require('./verifier-resolver');

function run(repo, labelsFile) {
  const labels = readJsonl(path.resolve(labelsFile));
  const results = [];
  let falseMatches = 0;
  let misses = 0;
  for (const label of labels) {
    const result = resolveClaim(label.claim, { repo: path.resolve(repo) });
    const expected = label.expected_verifier_id || label.expected_kind;
    const actual = result.kind === 'matched' ? result.verifier_id : result.kind;
    const matched = result.kind === 'matched';
    const expectedMatch = !!label.expected_verifier_id;
    const correct = actual === expected;
    if (matched && (!expectedMatch || actual !== expected)) falseMatches += 1;
    if (expectedMatch && !matched) misses += 1;
    results.push({ id: label.id, expected: expected, actual: actual, kind: result.kind, correct: correct, reason: result.reason || null, errors: result.missing ? result.missing.missing_input_schema || [] : [] });
  }
  const total = labels.length;
  return {
    schema_version: 'autoarmory/resolver-benchmark/v1',
    repo: path.resolve(repo),
    labels_file: path.resolve(labelsFile),
    total: total,
    correct_count: results.filter(function (item) { return item.correct; }).length,
    false_match_count: falseMatches,
    miss_count: misses,
    resolver_false_match_rate: total ? falseMatches / total : 0,
    resolver_miss_rate: total ? misses / total : 0,
    ok: total > 0 && falseMatches === 0,
    results: results
  };
}
module.exports = { run };