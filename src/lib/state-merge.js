'use strict';

const fs = require('fs');
const path = require('path');
const { readJsonl, writeJsonl } = require('./util');
const stateLock = require('./state-lock');

// Idempotent union of operator ledgers from legacy state roots into one target
// root. Rows are deduped by id (target rows win); reuse-records are copied by
// change_id when missing. Reruns read the merged target, add nothing and write
// nothing, so the merge is byte-idempotent. Sources are never modified.
const LEDGERS = ['cases', 'mechanisms', 'mechanism-runs', 'closures', 'lifecycle', 'candidates', 'transitions'];

function mergeLedger(targetDir, sourceDirs, name) {
  const targetFile = path.join(targetDir, name + '.jsonl');
  const seen = new Set();
  const merged = [];
  for (const row of readJsonl(targetFile)) {
    const id = row && row.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    merged.push(row);
  }
  const targetCount = merged.length;
  let added = 0;
  for (const dir of sourceDirs) {
    for (const row of readJsonl(path.join(dir, name + '.jsonl'))) {
      const id = row && row.id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      merged.push(row);
      added += 1;
    }
  }
  const before = fs.existsSync(targetFile) ? fs.readFileSync(targetFile, 'utf8') : '';
  const after = merged.map(function (row) { return JSON.stringify(row); }).join('\n') + (merged.length ? '\n' : '');
  return { ledger: name, target_count: targetCount, merged_count: merged.length, added: added, changed: before !== after, write: function () { if (before !== after) writeJsonl(targetFile, merged); } };
}

function mergeReuseRecords(targetDir, sourceDirs) {
  const targetReuse = path.join(targetDir, 'reuse-records');
  fs.mkdirSync(targetReuse, { recursive: true });
  let added = 0;
  const ids = [];
  for (const dir of sourceDirs) {
    const root = path.join(dir, 'reuse-records');
    if (!fs.existsSync(root)) continue;
    for (const name of fs.readdirSync(root).filter(function (x) { return /\.json$/i.test(x); })) {
      const target = path.join(targetReuse, name);
      if (fs.existsSync(target)) continue;
      fs.copyFileSync(path.join(root, name), target);
      added += 1;
      ids.push(name.replace(/\.json$/i, ''));
    }
  }
  return { added: added, change_ids: ids };
}

function mergeRoots(targetDir, sourceDirs) {
  const lock = stateLock.acquire(targetDir, { staleMs: 60000 });
  if (!lock.ok) return { ok: false, reason: lock.reason };
  try {
    const ledgers = LEDGERS.map(function (name) { return mergeLedger(targetDir, sourceDirs, name); });
    for (const ledger of ledgers) ledger.write();
    const reuseRecords = mergeReuseRecords(targetDir, sourceDirs);
    return { ok: true, schema_version: 'autoarmory/state-merge/v1', target: targetDir, sources: sourceDirs, ledgers: ledgers, reuse_records: reuseRecords };
  } finally { lock.release(); }
}

module.exports = { LEDGERS, mergeLedger, mergeReuseRecords, mergeRoots };
