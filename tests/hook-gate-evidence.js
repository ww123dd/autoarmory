'use strict';
const fs = require('fs');
const path = require('path');
function must(condition, message) { if (!condition) throw new Error(message); }
const raw = fs.readFileSync(path.resolve(__dirname, '..', 'docs', 'evidence', 'hook-gate-20260917.json'), 'utf8');
const report = JSON.parse(raw);
must(report.schema_version === 'autoarmory/hook-gate-evidence/v1', 'hook gate evidence schema');
must(report.edit_write_blocked_count === 0, 'ordinary edit/write must not be blocked');
must(report.external_action_without_approval_blocked === true && report.approved_external_action_allowed === true, 'external action approval boundary');
must(report.completion_without_verifier_blocked === true && report.completion_with_verifier_allowed === true, 'completion verifier boundary');
must(report.hook_decisions_persisted === true && report.llm_judge_calls === 0, 'decision persistence and no judge');
console.log('hook gate evidence passed: edit/write allowed, external approval blocked, completion verifier blocked');