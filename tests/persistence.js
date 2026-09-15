'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { writeJsonl, readJsonl } = require('../src/lib/util');

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
console.log('persistence tests passed: atomic write, backup, recovery');