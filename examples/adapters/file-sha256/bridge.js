#!/usr/bin/env node
'use strict';
const fs = require('fs');
const crypto = require('crypto');
let payload = {};
try { payload = JSON.parse(fs.readFileSync(0, 'utf8')); } catch (_) {}
const cfg = payload.server || {};
const file = cfg.path;
const expected = String(cfg.sha256 || '').toLowerCase();
let actual = null;
let exists = false;
try { actual = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); exists = true; } catch (_) {}
const observed = { path: file || null, exists: exists, expected: expected, sha256: actual, match: exists && actual === expected };
process.stdout.write(JSON.stringify({ ok: true, observed: observed }));