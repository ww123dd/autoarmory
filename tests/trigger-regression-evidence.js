'use strict';
const fs = require('fs');
const path = require('path');
function must(condition, message) { if (!condition) throw new Error(message); }
const file = path.resolve(__dirname, '..', 'docs', 'evidence', 'trigger-regression-20260917.json');
const raw = fs.readFileSync(file, 'utf8');
const report = JSON.parse(raw);
const hash = /^[a-f0-9]{64}$/;
function hashes(value, label) {
  must(value && Array.isArray(value.transcript_sha256) && value.transcript_sha256.length === 3, label + ' must carry three transcript hashes');
  for (const item of value.transcript_sha256) must(hash.test(item), label + ' transcript hashes must be sha256');
}
must(report.schema_version === 'autoarmory/trigger-regression-evidence/v1', 'evidence schema version');
must(report.harness === 'scripts/trigger-regression.js' && report.real_requests === 3, 'evidence must name the harness and three real requests');
hashes(report.baseline, 'baseline');
hashes(report.candidate, 'candidate');
hashes(report.restored, 'restored');
must(report.candidate.unwanted_skill_loads - report.baseline.unwanted_skill_loads === report.trigger_misfire_delta, 'misfire delta must be derived from the two counts');
must(report.trigger_misfire_delta === 3 && report.trigger_regression_count === 3, 'broken trigger must have a positive three-request regression');
must(report.restored.unwanted_skill_loads === report.baseline.unwanted_skill_loads && report.restored_trigger_regression_count === 0, 'restoring the description must return the regression to zero');
must(report.private_transcripts_shipped === false, 'private transcripts must not be shipped');
must(!/[A-Za-z]:[\\/]|\/Users\/|\/home\//.test(raw), 'evidence must not contain machine paths');
must(!/final_text_excerpt|transcript\"\s*:/.test(raw), 'evidence must not contain transcript content or paths');
console.log('trigger regression evidence passed: 3 real requests, delta=3, restored=0, hashes only, no private paths');