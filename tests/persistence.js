'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { writeJsonl, readJsonl, appendJsonl, dedupeJsonl, pruneBackups } = require('../src/lib/util');

function must(condition, message) {
  if (!condition) throw new Error(message);
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-persistence-'));
const file = path.join(temp, 'state.jsonl');
writeJsonl(file, [{ id: 'a', value: 1 }]);
writeJsonl(file, [{ id: 'b', value: 2 }]);
fs.writeFileSync(file, '{broken json\n', 'utf8');
must(fs.existsSync(file + '.bak'), 'atomic write must create a backup before overwrite');
const recovered = readJsonl(file);
must(recovered.length === 1 && recovered[0].id === 'a', 'readJsonl must recover from the previous backup');
const appendFile = path.join(temp, 'append.jsonl');
appendJsonl(appendFile, [{ id: 'a' }, { id: 'b' }]);
appendJsonl(appendFile, [{ id: 'b' }, { id: 'c' }]);
const deduped = dedupeJsonl(appendFile, function (row) { return row.id; });
must(deduped.changed === true && deduped.removed === 1, 'dedupe must remove duplicate append rows');
must(readJsonl(appendFile).map(function (row) { return row.id; }).join(',') === 'a,b,c', 'append-only + dedupe must preserve order');
for (let i = 0; i < 5; i++) { const backup = path.join(temp, 'retention-' + i + '.jsonl.bak'); fs.writeFileSync(backup, String(i), 'utf8'); }
const retention = pruneBackups(temp, { maxPerFile: 0, maxAgeDays: 7 });
must(retention.pruned >= 5, 'backup retention must prune old .bak files');
console.log('persistence tests passed: atomic write, backup, recovery');