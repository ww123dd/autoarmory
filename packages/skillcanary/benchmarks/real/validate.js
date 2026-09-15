'use strict';

const fs = require('fs');
const path = require('path');

const file = path.resolve(process.argv[2] || path.join(__dirname, 'cases.json'));
if (!fs.existsSync(file)) {
  console.error('Real benchmark file not found: ' + file);
  process.exit(2);
}
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const errors = [];
function need(cond, msg) { if (!cond) errors.push(msg); }
function obs(v, where) {
  need(v && Number.isInteger(v.pass) && Number.isInteger(v.total) && v.total > 0 && v.pass >= 0 && v.pass <= v.total, where + ' must be {pass,total}');
}
need(data.schema_version === 'skillcanary/real-benchmark/v1', 'schema_version must be skillcanary/real-benchmark/v1');
need(Array.isArray(data.cases) && data.cases.length > 0, 'cases must be a non-empty array');
for (const [i, c] of (data.cases || []).entries()) {
  const where = 'cases[' + i + ']';
  for (const key of ['id', 'source', 'skill', 'change', 'notes']) need(typeof c[key] === 'string' && c[key].trim() !== '', where + ' missing ' + key);
  need(c.expected === 'block' || c.expected === 'allow', where + ' expected must be block or allow');
  obs(c.before, where + '.before');
  obs(c.after, where + '.after');
}
if (errors.length) {
  for (const e of errors) console.error('x ' + e);
  process.exit(1);
}
console.log('Real benchmark OK: ' + data.cases.length + ' case(s)');