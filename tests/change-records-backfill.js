'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
function must(c, m) { if (!c) throw new Error(m); }
const repo = path.resolve(__dirname, '..');
const script = path.join(repo, 'scripts', 'backfill-change-records.js');
const lib = require(path.join(repo, 'src', 'lib', 'change-backfill'));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-change-backfill-'));
const engine = path.join(temp, 'change-inspector');
fs.mkdirSync(engine, { recursive: true });
function record(id) { return { schema_version: 'autoarmory/change-record/v1', id: id, session_id: 'rollout-fixture.jsonl', signal: 'command_called', observed_at: '2026-09-18T00:00:00.000Z', source: { line: 0 }, detail: {} }; }
function writeInventory(rows) { fs.writeFileSync(path.join(engine, 'change-inventory.jsonl'), rows.map(function (r) { return JSON.stringify(r); }).join('\n') + '\n', 'utf8'); }
function readCanonical() { return fs.readFileSync(path.join(engine, 'change-records.jsonl'), 'utf8'); }

// 1. missing canonical + inventory rows -> full write, order preserved
writeInventory([record('r1'), record('r2'), record('r3')]);
let r = spawnSync(process.execPath, [script, '--state', engine, '--json'], { encoding: 'utf8' });
must(r.status === 0, 'backfill CLI must succeed: ' + r.stderr + r.stdout);
let report = JSON.parse(r.stdout);
must(report.merged_count === 3 && report.wrote === true && report.duplicates_skipped === 0, 'first backfill must write all inventory rows');
const canonicalAfterFirst = readCanonical();
must(canonicalAfterFirst.indexOf('"id":"r1"') < canonicalAfterFirst.indexOf('"id":"r2"') && canonicalAfterFirst.indexOf('"id":"r2"') < canonicalAfterFirst.indexOf('"id":"r3"'), 'canonical must preserve inventory order');

// 2. rerun with unchanged inputs -> no write, byte-identical (idempotent)
r = spawnSync(process.execPath, [script, '--state', engine, '--json'], { encoding: 'utf8' });
must(r.status === 0, 'second backfill must succeed');
report = JSON.parse(r.stdout);
must(report.wrote === false && report.merged_count === 3, 'second backfill must be a no-op');
must(readCanonical() === canonicalAfterFirst, 'canonical must stay byte-identical on rerun');

// 3. duplicate id in inventory + new row -> dedupe by change_id, canonical wins
writeInventory([record('r2'), record('r2'), record('r4'), { schema_version: 'autoarmory/change-record/v1', id: null, signal: 'risk_signal' }]);
r = spawnSync(process.execPath, [script, '--state', engine, '--json'], { encoding: 'utf8' });
must(r.status === 0, 'backfill with duplicates must succeed');
report = JSON.parse(r.stdout);
must(report.merged_count === 4 && report.duplicates_skipped === 2 && report.missing_id_rows === 1, 'duplicate ids must be skipped and id-less row must be counted');
const canonical = lib.backfillChangeRecords(engine);
must(canonical.merged_count === 4, 'merged canonical must hold r1..r4');
const mergedText = readCanonical();
must(mergedText.indexOf('"id":"r1"') < mergedText.indexOf('"id":"r4"'), 'existing canonical rows must keep their position before appended inventory rows');

// 4. missing inventory file alone must not clobber or create canonical
const engine2 = path.join(temp, 'engine2');
fs.mkdirSync(engine2, { recursive: true });
fs.writeFileSync(path.join(engine2, 'change-records.jsonl'), JSON.stringify(record('k1')) + '\n', 'utf8');
const before = fs.readFileSync(path.join(engine2, 'change-records.jsonl'), 'utf8');
const solo = lib.backfillChangeRecords(engine2);
must(solo.wrote === false && solo.merged_count === 1, 'backfill without inventory must leave canonical untouched');
must(fs.readFileSync(path.join(engine2, 'change-records.jsonl'), 'utf8') === before, 'canonical bytes must not change when there is nothing to add');
console.log('change-records backfill tests passed: inventory -> canonical merge, dedupe by change_id, idempotent rerun, canonical-first ordering');
