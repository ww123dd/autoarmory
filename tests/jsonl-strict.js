'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readJsonlStrict } = require('../src/lib/util');
function must(condition, message) { if (!condition) throw new Error(message); }
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-jsonl-strict-'));
const missing = path.join(root, 'missing.jsonl');
let threw = false;
try { readJsonlStrict(missing); } catch (_) { threw = true; }
must(threw, 'missing JSONL must throw');
const empty = path.join(root, 'empty.jsonl');
fs.writeFileSync(empty, '', 'utf8');
must(Array.isArray(readJsonlStrict(empty)) && readJsonlStrict(empty).length === 0, 'empty JSONL must return []');
const partial = path.join(root, 'partial.jsonl');
fs.writeFileSync(partial, '{"ok":true}\n{"broken":', 'utf8');
threw = false;
try { readJsonlStrict(partial); } catch (_) { threw = true; }
must(threw, 'partial JSONL must throw');
console.log('jsonl strict tests passed: missing throws, empty returns [], partial throws');