'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text.replace(/\r\n/g, '\n').replace(/\r/g, '\n'), 'utf8');
}

function readJson(file) {
  return JSON.parse(readText(file));
}

function writeJson(file, value) {
  writeText(file, JSON.stringify(value, null, 2) + '\n');
}

function exists(file) {
  try { fs.accessSync(file); return true; } catch (_) { return false; }
}

function isDir(file) {
  try { return fs.statSync(file).isDirectory(); } catch (_) { return false; }
}

function walkFiles(root, options) {
  const opts = options || {};
  const skipNames = new Set(['.git', 'node_modules', '.skillcanary/runs', 'skillcanary.lock.json', '清单.md'].concat(opts.skip || []));
  const out = [];
  function walk(dir, relDir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = relDir ? relDir + '/' + entry.name : entry.name;
      if (skipNames.has(entry.name) || skipNames.has(rel)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, rel);
      else if (entry.isFile()) out.push(full);
    }
  }
  walk(root, '');
  return out.sort();
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function sha256Text(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function folderHash(root, options) {
  const files = walkFiles(root, options);
  const lines = files.map(function (file) {
    const rel = path.relative(root, file).replace(/\\/g, '/');
    return rel + ':' + sha256File(file);
  });
  return crypto.createHash('sha256').update(lines.join('\n')).digest('hex');
}

function relative(root, file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) args[key] = true;
      else { args[key] = next; i++; }
    } else {
      args._.push(a);
    }
  }
  return args;
}

function printJson(value) {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

function fail(message, code) {
  process.stderr.write((message || 'error') + '\n');
  return code || 2;
}

module.exports = {
  readText,
  writeText,
  readJson,
  writeJson,
  exists,
  isDir,
  walkFiles,
  sha256File,
  sha256Text,
  folderHash,
  relative,
  parseArgs,
  printJson,
  fail
};