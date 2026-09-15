'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { parseArgs, printJson, walkFiles } = require('../lib/util');

function commandExists(command, args) {
  const result = spawnSync(command, args || [], { encoding: 'utf8', shell: process.platform === 'win32' });
  return result.status === 0;
}

function commandOutput(command, args) {
  const result = spawnSync(command, args || [], { encoding: 'utf8', shell: process.platform === 'win32' });
  return result.status === 0 ? (result.stdout || '').trim() : null;
}

function scanLeaks(repo) {
  const patterns = [
    { id: 'windows-user-path', re: /C:\\Users\\[^\s"']+/i },
    { id: 'private-ip', re: /\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/ },
    { id: 'internal-account', re: /\breadonly_aa\b/ },
    { id: 'internal-mcp', re: /dolphinscheduler-readonly|doris-http/i }
  ];
  const hits = [];
  const files = walkFiles(repo, { skip: ['_local_archive'] });
  const self = path.join(repo, 'src', 'commands', 'release.js');
  for (const file of files) {
    if (file === self) continue;
    if (!/\.(md|json|js|ya?ml|txt)$/i.test(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const pattern of patterns) {
      if (pattern.re.test(text)) hits.push(path.relative(repo, file).replace(/\\/g, '/') + ':' + pattern.id);
    }
  }
  return hits;
}

module.exports = function run(argv) {
  const args = parseArgs(argv);
  const sub = args._[0] || 'preflight';
  if (sub !== 'preflight') {
    process.stderr.write('Usage: skillcanary release preflight [--json]\n');
    return 2;
  }

  const repo = path.resolve(args._[1] || process.cwd());
  const pkgFile = path.join(repo, 'package.json');
  const checks = [];
  if (!fs.existsSync(pkgFile)) {
    process.stderr.write('package.json not found: ' + pkgFile + '\n');
    return 1;
  }
  const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));

  function add(id, ok, detail, blocking) {
    checks.push({ id, ok: !!ok, detail: detail || '', blocking: blocking !== false });
  }

  const repository = JSON.stringify(pkg.repository || {}) + ' ' + String(pkg.homepage || '') + ' ' + String(pkg.bugs || '');
  add('package-repository', repository.indexOf('your-org') === -1, repository.indexOf('your-org') === -1 ? 'repository metadata is concrete' : 'package.json still contains your-org placeholder');
  add('git-user-name', !!commandOutput('git', ['config', '--get', 'user.name']), 'git user.name must be configured before commit');
  add('git-user-email', !!commandOutput('git', ['config', '--get', 'user.email']), 'git user.email must be configured before commit');
  add('npm-auth', !!commandOutput('npm', ['whoami']), 'npm whoami must succeed before npm publish');
  add('gh-cli', commandExists('gh', ['--version']), 'gh CLI is optional; needed to verify live PR comments', false);

  const leaks = scanLeaks(repo);
  add('privacy-scan', leaks.length === 0, leaks.length ? leaks.join(', ') : 'no known private path/account markers found');

  const blocking = checks.filter(function (check) { return check.blocking && !check.ok; });
  const result = { ok: blocking.length === 0, repo, checks, blocking: blocking.map(function (check) { return check.id; }) };
  if (args.json) printJson(result);
  else {
    process.stdout.write('SkillCanary release preflight @ ' + repo + '\n');
    for (const check of checks) process.stdout.write('  ' + (check.ok ? 'o ' : (check.blocking ? 'x ' : '! ')) + check.id + ': ' + check.detail + '\n');
    process.stdout.write('  Result: ' + (result.ok ? 'READY' : 'BLOCKED') + (blocking.length ? ' (' + blocking.map(function (check) { return check.id; }).join(', ') + ')' : '') + '\n');
  }
  return result.ok ? 0 : 1;
};

module.exports.scanLeaks = scanLeaks;
