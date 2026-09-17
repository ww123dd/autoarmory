'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const replay = require('../src/lib/replay-policy');
function must(condition, message) { if (!condition) throw new Error(message); }

const runs = [
  { id: 'r1', mechanism_id: 'm1', case_id: 'c1', result: 'fail', finished_at: '2026-01-01T00:00:00.000Z' },
  { id: 'r2', mechanism_id: 'm1', case_id: 'c1', result: 'pass', finished_at: '2026-01-01T00:01:00.000Z' },
  { id: 'r3', mechanism_id: 'm1', case_id: 'c1', result: 'pass', finished_at: '2026-01-01T00:02:00.000Z' },
  { id: 'r4', mechanism_id: 'm1', case_id: 'c1', result: 'pass', finished_at: '2026-01-01T00:03:00.000Z' },
  { id: 'r5', mechanism_id: 'm1', case_id: 'c1', result: 'pass', finished_at: '2026-01-01T00:04:00.000Z' }
];
const streak = replay.replayMechanismStreak(runs, { min_passes: 3 });
must(streak.baseline_pass_count === 4 && streak.candidate_pass_count === 2, 'streak replay must count candidate passes after three consecutive passes');
must(streak.tightening_rejection_count === 2 && streak.replay_escape_count === 0, 'a stricter replay must report tightening rejections without unsafe escapes');
const counts = [{ before: 10, after: 9 }, { before: 10, after: 4 }, { before: 10, after: 3 }];
const half = replay.replayCountHalf(counts, { ratio: 0.5 });
must(half.eligible_record_count === 3 && half.tightening_rejection_count === 1 && half.replay_escape_count === 0, 'count-half replay must reject only the non-halving records');
const missing = replay.replayCountHalf([{ result: 'pass' }], { ratio: 0.5 });
must(missing.insufficient_real_stream === true && missing.replay_escape_count === null, 'missing count history must fail closed as insufficient_real_stream');
const unsafe = replay.compareVerdicts([{}], function () { return false; }, function () { return true; });
must(unsafe.replay_escape_count === 1, 'candidate acceptance of an incumbent rejection must be counted as an escape');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-replay-'));
const input = path.join(temp, 'runs.jsonl');
fs.writeFileSync(input, runs.map(function (item) { return JSON.stringify(item); }).join('\n') + '\n', 'utf8');
const cli = path.resolve(__dirname, '..', 'scripts', 'replay-policy.js');
const result = spawnSync(process.execPath, [cli, '--input', input, '--policy', 'mechanism-streak', '--min-passes', '3', '--json', '--enforce'], { encoding: 'utf8' });
must(result.status === 0 && /tightening_rejection_count/.test(result.stdout), 'replay CLI must enforce escape-free stricter policies: ' + result.stdout + result.stderr);
console.log('replay policy tests passed: tightening rejection, zero unsafe escape, insufficient stream, real-input CLI');