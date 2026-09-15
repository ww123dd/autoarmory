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
function printJson(value) { process.stdout.write(JSON.stringify(value, null, 2) + '\n'); }
function sha256(text) { return crypto.createHash('sha256').update(text).digest('hex'); }
function parseArgs(argv) { const args = { _: [] }; for (let i = 0; i < argv.length; i++) { const item = argv[i]; if (item.startsWith('--')) { const key = item.slice(2); const next = argv[i + 1]; if (!next || next.startsWith('--')) args[key] = true; else { args[key] = next; i++; } } else args._.push(item); } return args; }
function redact(text) { return String(text).replace(/(sk-[A-Za-z0-9]{12,}|ghp_[A-Za-z0-9]{12,}|AKIA[0-9A-Z]{12,})/g, '[REDACTED_SECRET]').replace(/(password|passwd|token|api[_-]?key)\s*[:=]\s*["']?[^\s"']+/ig, '$1=[REDACTED]').replace(/C:\\Users\\[^\s"'<>]+/ig, '[REDACTED_PATH]'); }
function walkFiles(root, options) { const out = []; const skip = new Set(['.git', 'node_modules', '.selfforge', '.autoarmory'].concat((options && options.skip) || [])); function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { if (skip.has(entry.name)) continue; const full = path.join(dir, entry.name); if (entry.isDirectory()) walk(full); else if (entry.isFile()) out.push(full); } } walk(root); return out.sort(); }
module.exports = { readText, writeText, readJson, writeJson, readJsonl, writeJsonl, printJson, sha256, parseArgs, redact, walkFiles };