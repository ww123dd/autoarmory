'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function resolve(flag, cwd) {
  const candidates = [flag, process.env.SKILLCANARY_HOME, path.resolve(cwd || '.', '../20260914_SkillCanary')].filter(Boolean);
  for (const candidate of candidates) { const cli = path.resolve(candidate, 'bin', 'skillcanary.js'); if (fs.existsSync(cli)) return cli; }
  return null;
}
function run(args, options) {
  const opts = options || {};
  const cli = resolve(opts.path, opts.cwd);
  if (!cli) return { code: 2, out: '', err: 'SkillCanary CLI not found. Set SKILLCANARY_HOME or pass --skillcanary <repo>.' };
  const result = spawnSync(process.execPath, [cli].concat(args || []), { cwd: opts.cwd || process.cwd(), encoding: 'utf8' });
  return { code: result.status, out: result.stdout || '', err: result.stderr || '', cli };
}
module.exports = { resolve, run };
