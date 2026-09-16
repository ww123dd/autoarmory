#!/usr/bin/env node
'use strict';
const fs = require('fs');
let payload = {};
try { payload = JSON.parse(fs.readFileSync(0, 'utf8')); } catch (_) {}
const pidFile = payload && payload.server && payload.server.pid_file;
let raw = '';
try { raw = fs.readFileSync(pidFile, 'utf8').trim(); } catch (_) {}
const pid = /^[1-9]\d*$/.test(raw) ? Number(raw) : null;
let alive = false;
if (pid) {
  try { process.kill(pid, 0); alive = true; }
  catch (error) { alive = error && error.code === 'EPERM'; }
}
const observed = { pid_file: pidFile || null, raw, pid, parse_ok: Boolean(pid), alive, valid_and_alive: Boolean(pid && alive) };
process.stdout.write(JSON.stringify({ ok: true, observed }));