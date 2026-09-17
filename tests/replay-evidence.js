'use strict';
const fs = require('fs');
const path = require('path');
function must(condition, message) { if (!condition) throw new Error(message); }
const file = path.resolve(__dirname, '..', 'docs', 'evidence', 'replay-20260917.json');
const raw = fs.readFileSync(file, 'utf8');
const report = JSON.parse(raw);
must(report.schema_version === 'autoarmory/replay-evidence/v1', 'replay evidence schema');
must(report.record_count === 13 && /^[a-f0-9]{64}$/.test(report.source_sha256), 'replay evidence must name the real 13-record source and its hash');
must(report.mechanism_streak && report.mechanism_streak.replay_escape_count === 0 && report.mechanism_streak.tightening_rejection_count === 3, 'mechanism streak evidence must report 3 tightening rejections and 0 escapes');
must(report.mechanism_streak.baseline_pass_count === 11 && report.mechanism_streak.candidate_pass_count === 8, 'mechanism streak pass counts must be internally consistent');
must(report.count_half && report.count_half.insufficient_real_stream === true && report.count_half.eligible_record_count === 0, 'count-half must remain insufficient instead of fabricating a stream');
must(report.synthetic_record_count === 0 && report.llm_judge_calls === 0, 'replay evidence must record no synthetic records and no LLM judge calls');
must(report.private_records_shipped === false, 'the private source stream must not be shipped');
must(!/[A-Za-z]:[\\/]|\/Users\/|\/home\//.test(raw), 'the replay evidence must not contain machine paths');
must(!/"details"\s*:/.test(raw), 'the replay evidence must not ship per-record details');
console.log('replay evidence passed: 13 real runs, tightening_rejections=3, replay_escape_count=0, count-half=insufficient');