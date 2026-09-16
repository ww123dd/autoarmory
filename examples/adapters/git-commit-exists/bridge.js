#!/usr/bin/env node
'use strict';
const fs = require('fs');
const { spawnSync } = require('child_process');
let payload = {};
try { payload = JSON.parse(fs.readFileSync(0, 'utf8')); } catch (_) {}
const cfg = payload.server || {};
const result = spawnSync('git', ['-C', String(cfg.repo || ''), 'cat-file', '-e', String(cfg.commit || '') + '^{commit}'], { encoding: 'utf8', timeout: 10000, windowsHide: true });
const observed = { repo: cfg.repo || null, commit: cfg.commit || null, exists: result.status === 0 };
process.stdout.write(JSON.stringify({ ok: true, observed: observed }));