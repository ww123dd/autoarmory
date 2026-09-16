#!/usr/bin/env node
'use strict';
// Heterogeneous fact source: the Windows registry (OS configuration store).
// Thin bridge on the shared state-query adapter: read stdin, emit { ok, observed }.
const fs = require('fs');
const { spawnSync } = require('child_process');
let payload = {};
try { payload = JSON.parse(fs.readFileSync(0, 'utf8')); } catch (_) {}
const cfg = payload.server || {};
const hive = String(cfg.hive || '');
const key = String(cfg.key || '');
const name = String(cfg.name || '');
const observed = { hive: hive || null, key: key || null, name: name || null, exists: false, type: null, value: null, numeric: null };
if (/^(HKLM|HKCU|HKCR|HKU|HKCC)$/i.test(hive) && key && name) {
  const query = spawnSync('reg', ['query', hive + '\\' + key, '/v', name], { encoding: 'utf8', timeout: 10000, windowsHide: true });
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const row = String(query.stdout || '').split(/\r?\n/).find(function (line) { return new RegExp('(^|\\s)' + escaped + '\\s+REG_', 'i').test(line); });
  const match = row ? row.trim().match(/^(\S+)\s+(REG_\w+)\s+(.*)$/) : null;
  if (query.status === 0 && match) {
    observed.exists = true;
    observed.type = match[2];
    observed.value = match[3].trim();
    observed.numeric = /^-?\d+$/.test(observed.value) ? Number(observed.value) : null;
  }
}
process.stdout.write(JSON.stringify({ ok: true, observed: observed }));