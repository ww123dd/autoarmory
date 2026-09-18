'use strict';

const fs = require('fs');
const path = require('path');
const { readJsonl, writeJsonl } = require('./util');

// One-time, idempotent migration: legacy change-inventory.jsonl -> canonical
// change-records.jsonl. Rows are deduped by record id (the change_id); rows
// already present in the canonical file win over inventory copies. The file is
// only rewritten when the merged set differs from what is on disk, so repeated
// runs are no-ops. Inventory is never modified.
function backfillChangeRecords(engineDir) {
  const inventoryFile = path.join(engineDir, 'change-inventory.jsonl');
  const canonicalFile = path.join(engineDir, 'change-records.jsonl');
  const existing = readJsonl(canonicalFile);
  const inventory = readJsonl(inventoryFile);
  const seen = new Set();
  const merged = [];
  let duplicatesSkipped = 0;
  let missingIdRows = 0;
  for (const row of existing.concat(inventory)) {
    const id = row && row.id;
    if (!id) { missingIdRows += 1; continue; }
    if (seen.has(id)) { duplicatesSkipped += 1; continue; }
    seen.add(id);
    merged.push(row);
  }
  const canonicalExists = fs.existsSync(canonicalFile);
  const wrote = !canonicalExists || merged.length !== existing.length;
  if (wrote) writeJsonl(canonicalFile, merged);
  return {
    schema_version: 'autoarmory/change-records-backfill/v1',
    engine_dir: engineDir,
    inventory_count: inventory.length,
    existing_count: existing.length,
    merged_count: merged.length,
    duplicates_skipped: duplicatesSkipped,
    missing_id_rows: missingIdRows,
    wrote: wrote,
    canonical_file: canonicalFile
  };
}

module.exports = { backfillChangeRecords };
