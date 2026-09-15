'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'bin', 'autoarmory.js');
function run(args) { const result = spawnSync(process.execPath, [cli].concat(args), { cwd: root, encoding: 'utf8' }); return { code: result.status, out: result.stdout || '', err: result.stderr || '' }; }

for (const command of ['route', 'outcome']) {
  const result = run([command, '--json']);
  if (result.code !== 2 || !/Unknown command/.test(result.err)) throw new Error(command + ' must no longer be exposed');
}

const close = run(['close', '--help']);
if (close.code !== 2 || !/Usage: autoarmory close/.test(close.err)) throw new Error('close command must be present');
console.log('removed alias tests passed: route/outcome rejected, close present');