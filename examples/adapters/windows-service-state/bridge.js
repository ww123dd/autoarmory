#!/usr/bin/env node
'use strict';
// Heterogeneous fact source: the Windows Service Control Manager (host service table).
// Thin bridge on the shared state-query adapter: read stdin, emit { ok, observed }.
const fs = require('fs');
const { spawnSync } = require('child_process');
let payload = {};
try { payload = JSON.parse(fs.readFileSync(0, 'utf8')); } catch (_) {}
const cfg = payload.server || {};
const name = String(cfg.name || '');
const observed = { name: name || null, exists: false, state: null, state_code: null, win32_exit_code: null };
if (name && /^[A-Za-z0-9_.\- ]+$/.test(name)) {
  const query = spawnSync('sc.exe', ['query', name], { encoding: 'utf8', timeout: 10000, windowsHide: true });
  const text = String(query.stdout || '');
  if (query.status === 0 && /SERVICE_NAME\s*:/i.test(text)) {
    observed.exists = true;
    const state = text.match(/STATE\s*:\s*(\d+)\s+([A-Z_]+)/);
    if (state) { observed.state_code = Number(state[1]); observed.state = state[2]; }
    const exit = text.match(/WIN32_EXIT_CODE\s*:\s*(\d+)/);
    if (exit) observed.win32_exit_code = Number(exit[1]);
  }
}
process.stdout.write(JSON.stringify({ ok: true, observed: observed }));