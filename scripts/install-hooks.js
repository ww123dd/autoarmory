#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'inherit' });
const hook = path.resolve('.githooks', 'pre-commit');
if (process.platform !== 'win32') fs.chmodSync(hook, 0o755);
console.log('Installed repository hooks: ' + hook);