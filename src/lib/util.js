const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function readText(file) { return fs.readFileSync(file, 'utf8'); }
function writeText(file, text) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text.replace(/\r\n/g, '\n').replace(/\r/g, '\n'), 'utf8'); }
function readJson(file) { return JSON.parse(readText(file)); }
function writeJson(file, value) { writeText(file, JSON.stringify(value, null, 2) + '\n'); }
function readJsonl(file) { if (!fs.existsSync(file)) return []; return readText(file).split(/\r?\n/).filter(Boolean).map(function (line) { return JSON.parse(line); }); }
function writeJsonl(file, values) { writeText(file, values.map(function (value) { return JSON.stringify(value); }).join('\n') + (values.length ? '\n' : '')); }
function printJson(value) { process.stdout.write(JSON.stringify(value, null, 2) + '\n'); }
function sha256(text) { return crypto.createHash('sha256').update(text).digest('hex'); }
function parseArgs(argv) { const args = { _: [] }; for (let i = 0; i < argv.length; i++) { const item = argv[i]; if (item.startsWith('--')) { const key = item.slice(2); const next = argv[i + 1]; if (!next || next.startsWith('--')) args[key] = true; else { args[key] = next; i++; } } else args._.push(item); } return args; }
function redact(text) { return String(text).replace(/(sk-[A-Za-z0-9]{12,}|ghp_[A-Za-z0-9]{12,}|AKIA[0-9A-Z]{12,})/g, '[REDACTED_SECRET]').replace(/(password|passwd|token|api[_-]?key)\s*[:=]\s*["']?[^\s"']+/ig, '$1=[REDACTED]').replace(/C:\\Users\\[^\s"'<>]+/ig, '[REDACTED_PATH]'); }
function walkFiles(root, options) { const out = []; const skip = new Set(['.git', 'node_modules', '.selfforge'].concat((options && options.skip) || [])); function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { if (skip.has(entry.name)) continue; const full = path.join(dir, entry.name); if (entry.isDirectory()) walk(full); else if (entry.isFile()) out.push(full); } } walk(root); return out.sort(); }
module.exports = { readText, writeText, readJson, writeJson, readJsonl, writeJsonl, printJson, sha256, parseArgs, redact, walkFiles };
