'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { sha256 } = require('./util');

function command(command, args) {
  const result = spawnSync(command, args || [], { encoding: 'utf8', shell: process.platform === 'win32' });
  return result.status === 0 ? (result.stdout || '').trim() : null;
}

function fingerprint(dir) {
  const root = path.resolve(dir || '.');
  const pkg = fs.existsSync(path.join(root, 'package.json')) ? JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) : {};
  const data = {
    schema_version: 'selfforge/environment/v1',
    os: os.platform(),
    release: os.release(),
    arch: os.arch(),
    node: process.version,
    npm: command('npm', ['--version']),
    git_commit: command('git', ['rev-parse', 'HEAD']),
    git_branch: command('git', ['rev-parse', '--abbrev-ref', 'HEAD']),
    package_name: pkg.name || null,
    package_version: pkg.version || null,
    cwd: root,
    observed_at: new Date().toISOString()
  };
  data.fingerprint = sha256(JSON.stringify({
    os: data.os, release: data.release, arch: data.arch, node: data.node, npm: data.npm,
    git_commit: data.git_commit, package_name: data.package_name, package_version: data.package_version
  }));
  return data;
}

module.exports = { fingerprint };
