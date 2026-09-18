#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { runStopShadow, recordGap } = require('../src/lib/stop-shadow');
function arg(name) { const index = process.argv.indexOf(name); return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : null; }
function event() {
  const file = arg('--event');
  if (file) return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8') || '{}');
  let raw = '';
  try { raw = fs.readFileSync(0, 'utf8'); } catch (_) { raw = ''; }
  return JSON.parse(raw || '{}');
}
let ev = {};
try { ev = event(); } catch (_) { ev = {}; }
try { runStopShadow(ev, { repo: path.resolve(__dirname, '..') }); } catch (error) { try { recordGap(process.env.AUTOARMORY_STOP_STATE || path.join(require('os').homedir(), '.codex', 'autoarmory', 'stop-shadow'), ev, 'internal_error'); } catch (_) {} }
process.exit(0);
