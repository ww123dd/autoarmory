'use strict';

const path = require('path');
const { walkFiles, sha256File, readJson, writeJson, relative, parseArgs, printJson } = require('../lib/util');

function computeLock(skillDir) {
  const files = walkFiles(skillDir, { skip: ['skillcanary.lock.json'] });
  const entries = {};
  for (const file of files) entries[relative(skillDir, file)] = sha256File(file);
  const lines = Object.keys(entries).sort().map(function (key) { return key + ':' + entries[key]; });
  const crypto = require('crypto');
  const folderHash = crypto.createHash('sha256').update(lines.join('\n')).digest('hex');
  return {
    schema_version: 'skillcanary/lock/v1',
    generated_at: new Date().toISOString(),
    root: path.basename(path.resolve(skillDir)),
    algorithm: 'sha256',
    folder_hash: folderHash,
    files: entries
  };
}

function compare(current, locked) {
  const drift = [];
  const a = locked.files || {};
  const b = current.files || {};
  for (const key of Object.keys(a)) {
    if (!(key in b)) drift.push('removed: ' + key);
    else if (a[key] !== b[key]) drift.push('changed: ' + key);
  }
  for (const key of Object.keys(b)) if (!(key in a)) drift.push('added: ' + key);
  if (drift.length === 0 && locked.folder_hash !== current.folder_hash) drift.push('folder_hash');
  return drift;
}

module.exports = function run(argv) {
  const args = parseArgs(argv);
  const skillDir = args._[0];
  if (!skillDir) {
    process.stderr.write('Usage: skillcanary anchor <skill-dir> [--check] [--output skillcanary.lock.json]\n');
    return 2;
  }
  const lockFile = args.output ? (path.isAbsolute(args.output) ? args.output : path.join(skillDir, args.output)) : path.join(skillDir, 'skillcanary.lock.json');
  const current = computeLock(skillDir);
  if (args.check) {
    if (!require('fs').existsSync(lockFile)) {
      process.stderr.write('lock file not found: ' + lockFile + '\n');
      return 1;
    }
    const locked = readJson(lockFile);
    const drift = compare(current, locked);
    if (args.json) printJson({ ok: drift.length === 0, drift, lockFile });
    else {
      process.stdout.write('SkillCanary anchor --check @ ' + path.resolve(lockFile) + '\n');
      if (drift.length === 0) process.stdout.write('  Result: IN_SYNC\n');
      else {
        for (const item of drift) process.stdout.write('  x ' + item + '\n');
        process.stdout.write('  Result: DRIFT ' + drift.length + '\n');
      }
    }
    return drift.length ? 1 : 0;
  }
  writeJson(lockFile, current);
  if (args.json) printJson(current);
  else {
    process.stdout.write('SkillCanary anchor @ ' + path.resolve(skillDir) + '\n');
    process.stdout.write('  file_count: ' + Object.keys(current.files).length + '\n');
    process.stdout.write('  folder_hash: ' + current.folder_hash + '\n');
    process.stdout.write('  lock_file: ' + lockFile + '\n');
  }
  return 0;
};

module.exports.computeLock = computeLock;
module.exports.compare = compare;