const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function normalizeText(text) { return String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n'); }
function readText(file) { return fs.readFileSync(file, 'utf8'); }
function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const normalized = normalizeText(text);
  const temp = file + '.tmp-' + process.pid + '-' + Date.now();
  const fd = fs.openSync(temp, 'w');
  try { fs.writeSync(fd, normalized); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  if (fs.existsSync(file)) fs.copyFileSync(file, file + '.bak');
  fs.renameSync(temp, file);
}
function parseJson(text) { return JSON.parse(text); }
function readJson(file) {
  try { return parseJson(readText(file)); }
  catch (error) {
    const backup = file + '.bak';
    if (fs.existsSync(backup)) return parseJson(readText(backup));
    throw new Error('invalid JSON in ' + file + ': ' + error.message);
  }
}
function writeJson(file, value) { writeText(file, JSON.stringify(value, null, 2) + '\n'); }
function parseJsonl(text) { return normalizeText(text).split('\n').filter(Boolean).map(function (line) { return JSON.parse(line); }); }
function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  try { return parseJsonl(readText(file)); }
  catch (error) {
    const backup = file + '.bak';
    if (fs.existsSync(backup)) return parseJsonl(readText(backup));
    throw new Error('invalid JSONL in ' + file + ': ' + error.message);
  }
}
function writeJsonl(file, values) { writeText(file, values.map(function (value) { return JSON.stringify(value); }).join('\n') + (values.length ? '\n' : '')); }
function appendJsonl(file, values) {
  const list = (Array.isArray(values) ? values : [values]).filter(function (value) { return value !== undefined && value !== null; });
  if (!list.length) return 0;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const fd = fs.openSync(file, 'a');
  try { fs.writeSync(fd, list.map(function (value) { return JSON.stringify(value); }).join('\n') + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  return list.length;
}
function dedupeJsonl(file, keyFn) {
  if (!fs.existsSync(file)) return { changed: false, before: 0, after: 0, removed: 0 };
  const rows = readJsonl(file);
  const seen = {};
  const unique = rows.filter(function (row) { const key = keyFn ? keyFn(row) : JSON.stringify(row); if (seen[key]) return false; seen[key] = true; return true; });
  if (unique.length === rows.length) return { changed: false, before: rows.length, after: rows.length, removed: 0 };
  writeJsonl(file, unique);
  return { changed: true, before: rows.length, after: unique.length, removed: rows.length - unique.length };
}
function pruneBackups(root, options) {
  const opts = options || {};
  const maxPerFile = opts.maxPerFile !== undefined ? Number(opts.maxPerFile) : 3;
  const maxAgeDays = opts.maxAgeDays !== undefined ? Number(opts.maxAgeDays) : 7;
  const cutoff = Date.now() - maxAgeDays * 86400000;
  const groups = {};
  for (const entry of fs.existsSync(root) ? fs.readdirSync(root, { withFileTypes: true }) : []) {
    if (!entry.isFile() || !/\.bak$/.test(entry.name)) continue;
    const full = path.join(root, entry.name);
    const base = full.replace(/\.bak$/, '');
    (groups[base] = groups[base] || []).push(full);
  }
  let pruned = 0;
  for (const base of Object.keys(groups)) {
    const files = groups[base].map(function (file) { let stat = null; try { stat = fs.statSync(file); } catch (_) {} return { file: file, mtimeMs: stat ? stat.mtimeMs : 0 }; }).sort(function (a, b) { return b.mtimeMs - a.mtimeMs; });
    files.forEach(function (item, index) { if (index >= maxPerFile || item.mtimeMs < cutoff) { try { fs.unlinkSync(item.file); pruned += 1; } catch (_) {} } });
  }
  return { pruned: pruned };
}
function printJson(value) { process.stdout.write(JSON.stringify(value, null, 2) + '\n'); }
function sha256(text) { return crypto.createHash('sha256').update(text).digest('hex'); }
function parseArgs(argv) { const args = { _: [] }; for (let i = 0; i < argv.length; i++) { const item = argv[i]; if (item.startsWith('--')) { const key = item.slice(2); const next = argv[i + 1]; if (!next || next.startsWith('--')) args[key] = true; else { args[key] = next; i++; } } else args._.push(item); } return args; }
function redact(text) { return String(text).replace(/(sk-[A-Za-z0-9]{12,}|ghp_[A-Za-z0-9]{12,}|AKIA[0-9A-Z]{12,})/g, '[REDACTED_SECRET]').replace(/(password|passwd|token|api[_-]?key)\s*[:=]\s*["']?[^\s"']+/ig, '$1=[REDACTED]').replace(/C:\\Users\\[^\s"'<>]+/ig, '[REDACTED_PATH]'); }
function walkFiles(root, options) { const out = []; const skip = new Set(['.git', 'node_modules', '.selfforge', '.autoarmory'].concat((options && options.skip) || [])); function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { if (skip.has(entry.name)) continue; const full = path.join(dir, entry.name); if (entry.isDirectory()) walk(full); else if (entry.isFile()) out.push(full); } } walk(root); return out.sort(); }
module.exports = { readText, writeText, readJson, writeJson, readJsonl, writeJsonl, appendJsonl, dedupeJsonl, pruneBackups, printJson, sha256, parseArgs, redact, walkFiles };