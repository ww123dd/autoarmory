#!/usr/bin/env node
'use strict';
const fs = require('fs');
let payload = {};
try { payload = JSON.parse(fs.readFileSync(0, 'utf8')); } catch (_) {}
const cfg = payload.server || {};
const file = cfg.path;
const spec = cfg.assertion || {};
function get(value, path) {
  const parts = String(path || '').replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let current = value;
  for (const part of parts) { if (current === null || current === undefined) return undefined; current = current[part]; }
  return current;
}
function number(value) { return typeof value === 'number' ? value : Number(value); }
function compare(op, actual, expected) {
  if (op === 'exists') return actual !== undefined && actual !== null;
  if (actual === undefined || actual === null) return false;
  if (op === 'eq') return (typeof actual === 'number' || typeof expected === 'number') ? number(actual) === number(expected) : actual === expected;
  if (op === 'ne') return actual !== expected;
  if (op === 'gt') return number(actual) > number(expected);
  if (op === 'gte') return number(actual) >= number(expected);
  if (op === 'lt') return number(actual) < number(expected);
  if (op === 'lte') return number(actual) <= number(expected);
  return false;
}
let exists = false;
let actual = null;
let error = null;
try { actual = get(JSON.parse(fs.readFileSync(file, 'utf8')), spec.path); exists = true; } catch (err) { error = err.message; }
const op = spec.op || 'eq';
const passed = exists && compare(op, actual, spec.value);
process.stdout.write(JSON.stringify({ ok: true, observed: { path: file || null, exists: exists, actual: actual, expected: spec.value === undefined ? null : spec.value, op: op, passed: Boolean(passed), error: error } }));