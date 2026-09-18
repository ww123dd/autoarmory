'use strict';
const fs = require('fs');
const path = require('path');
function must(condition, message) { if (!condition) throw new Error(message); }
const raw = fs.readFileSync(path.resolve(__dirname, '..', 'docs', 'evidence', 'mechanism-scope-20260918.json'), 'utf8');
const report = JSON.parse(raw);
must(report.schema_version === 'autoarmory/mechanism-scope-evidence/v1', 'mechanism scope evidence schema');
const a = report.acceptance;
must(a.unscoped_promotion_count === 0 && a.out_of_scope_reuse_count === 0 && a.expired_mechanism_reuse_count === 0, 'scope reuse/promotion escapes');
must(a.legacy_unscoped_promotion_count === 0 && a.reopen_trigger_invalid_count === 0 && a.reopen_required_escape_count === 0, 'legacy/trigger/reopen escapes');
must(report.predicate_kinds.length === 6 && report.predicate_kinds.indexOf('file_changed') !== -1, 'six computable trigger kinds');
must(report.scope_is_correctness_proof === false && report.free_text_trigger_count === 0, 'scope is not correctness proof and triggers are not labels');
must(report.private_state_shipped === false, 'private state is not shipped');
must(!/[A-Za-z]:[\\/]|\/Users\/|\/home\//.test(raw), 'evidence must not contain machine paths');
console.log('mechanism scope evidence passed: six escape counts zero, six predicate kinds, no free-text triggers');