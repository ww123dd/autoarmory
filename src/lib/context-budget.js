'use strict';

const fs = require('fs');
const path = require('path');
const { DESCRIPTION_MAX_CHARS, SKILL_MAX_LINES, SKILL_MAX_BYTES } = require('./context-limits');

const DEFAULT_LIMITS = {
  max_always_loaded_bytes: SKILL_MAX_BYTES,
  max_always_loaded_lines: SKILL_MAX_LINES,
  max_description_chars: DESCRIPTION_MAX_CHARS
};

function isText(file) {
  return /\.(md|markdown|txt|json|ya?ml|toml|ini|js|cjs|mjs|ts|sh|ps1|sql|py)$/i.test(file);
}
function walk(root, out) {
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch (_) { return; }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile()) out.push(full);
  }
}
function size(file) { try { return fs.statSync(file).size; } catch (_) { return 0; } }
function links(text) {
  const out = [];
  const markdown = /\[[^\]]*\]\(([^)]+)\)/g;
  const code = /`([^`]+)`/g;
  const bare = /(?:^|\s)([A-Za-z0-9_./\\-]+\.(?:md|markdown|txt|json|jsonl|ya?ml|toml|ini|js|cjs|mjs|ts|sh|ps1|sql|py))(?=\s|$)/g;
  let match;
  while ((match = markdown.exec(text))) out.push(match[1]);
  while ((match = code.exec(text))) if (/[\\/]/.test(match[1])) out.push(match[1]);
  while ((match = bare.exec(text))) out.push(match[1]);
  return out;
}
function resolveLink(root, base, value) {
  const raw = String(value || '').split('#')[0].split('?')[0].trim();
  if (!raw || /^(https?:|mailto:|data:)/i.test(raw)) return null;
  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch (_) {}
  const full = path.resolve(base, decoded);
  const relative = path.relative(root, full);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return full;
}
function descriptionChars(text) {
  const match = String(text || '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return 0;
  const line = (match[1].match(/^description:\s*(.+)$/m) || [])[1] || '';
  return line.trim().replace(/^["']|["']$/g, '').length;
}
function contextBudget(skillDir) {
  const root = path.resolve(skillDir);
  const entry = path.join(root, 'SKILL.md');
  if (!fs.existsSync(entry)) return { ok: false, errors: ['SKILL.md not found: ' + entry] };
  const all = [];
  walk(root, all);
  const index = new Map();
  for (const file of all) {
    if (file === entry) continue;
    const rel = path.relative(root, file).split(path.sep).join('/');
    const keys = [rel, rel.replace(/\.[^.]+$/, ''), path.basename(file).replace(/\.[^.]+$/, '')];
    for (const key of keys) if (key.length >= 4) index.set(key, file);
  }
  const referenced = new Set();
  const queue = [{ file: entry, depth: 0 }];
  let maxLinkDepth = 0;
  while (queue.length) {
    const current = queue.shift();
    if (!fs.existsSync(current.file) || !isText(current.file)) continue;
    let text;
    try { text = fs.readFileSync(current.file, 'utf8'); } catch (_) { continue; }
    for (const value of links(text)) {
      const target = resolveLink(root, path.dirname(current.file), value);
      if (!target || !fs.existsSync(target) || !fs.statSync(target).isFile() || target === entry || referenced.has(target)) continue;
      referenced.add(target);
      maxLinkDepth = Math.max(maxLinkDepth, current.depth + 1);
      queue.push({ file: target, depth: current.depth + 1 });
    }
    for (const [key, target] of index) {
      if (referenced.has(target)) continue;
      if (text.indexOf(key) !== -1) {
        referenced.add(target);
        maxLinkDepth = Math.max(maxLinkDepth, current.depth + 1);
        queue.push({ file: target, depth: current.depth + 1 });
      }
    }
  }
  const referencedFiles = Array.from(referenced).sort();
  const orphanFiles = all.filter(function (file) { return file !== entry && !referenced.has(file); }).sort();
  const appendixFiles = all.filter(function (file) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    return rel === 'appendix' || rel.indexOf('appendix/') === 0;
  });
  const entryText = fs.readFileSync(entry, 'utf8');
  return {
    ok: true,
    schema_version: 'autoarmory/context-budget/v1',
    skill_dir: root,
    metrics: {
      always_loaded_bytes: size(entry),
      always_loaded_lines: entryText.split(/\r?\n/).length,
      description_chars: descriptionChars(entryText),
      referenced_bytes: referencedFiles.reduce(function (sum, file) { return sum + size(file); }, 0),
      orphan_bytes: orphanFiles.reduce(function (sum, file) { return sum + size(file); }, 0),
      appendix_bytes: appendixFiles.reduce(function (sum, file) { return sum + size(file); }, 0),
      referenced_file_count: referencedFiles.length,
      orphan_file_count: orphanFiles.length,
      max_link_depth: maxLinkDepth,
      total_bytes: all.reduce(function (sum, file) { return sum + size(file); }, 0)
    },
    referenced_files: referencedFiles.slice(0, 200),
    orphan_files: orphanFiles.slice(0, 200),
    appendix_files: appendixFiles.slice(0, 200)
  };
}
function budgetEscapes(metrics, budget) {
  const limits = Object.assign({}, DEFAULT_LIMITS, budget || {});
  const checks = [
    ['always_loaded_bytes', 'max_always_loaded_bytes'],
    ['always_loaded_lines', 'max_always_loaded_lines'],
    ['description_chars', 'max_description_chars']
  ];
  const violations = [];
  for (const pair of checks) {
    const value = Number(metrics[pair[0]] || 0);
    const limit = Number(limits[pair[1]]);
    if (Number.isFinite(limit) && value > limit) violations.push({ metric: pair[0], value: value, limit: limit });
  }
  return { count: violations.length, violations: violations, limits: limits };
}
module.exports = { contextBudget, budgetEscapes, DEFAULT_LIMITS };