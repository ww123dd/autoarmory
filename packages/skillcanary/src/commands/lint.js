'use strict';

const fs = require('fs');
const path = require('path');
const { parseArgs, printJson } = require('../lib/util');
const { DESCRIPTION_MAX_CHARS, SKILL_MAX_LINES, SKILL_MAX_BYTES } = require('../lib/context-limits');
const { validateTriggerContract } = require('../lib/trigger-contract');

const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ABSOLUTE_PATH_RE = /(?:^|[^A-Za-z])[A-Za-z]:[\\/]|\/Users\/|\/home\//;
function loadIgnores(skillDir) {
  const file = path.join(skillDir, '.skillcanaryignore');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/)
    .map(function (line) { return line.trim(); })
    .filter(function (line) { return line && line.charAt(0) !== '#'; })
    .map(function (line) {
      const parts = line.split(':');
      return { rule: parts[0], file: parts[1] || '' };
    });
}
function ignored(ignores, rule, file) {
  return ignores.some(function (x) { return x.rule === rule && (x.file === file || x.file === '*'); });
}
function looksLikeSecret(line) {
  const lower = line.toLowerCase();
  const falsePositive = ['${', '{{', '<', '>', 'placeholder', 'example', '示例', '占位', '数据库密码', 'process.env', 'getenv', 'os.environ', 'def ', 'function ', 'secret-like', 'redact', 'args.', 'self.', 'parser.add_argument'];
  if (falsePositive.some(function (x) { return lower.indexOf(x) !== -1; })) return false;
  if (/-----BEGIN [A-Z ]+PRIVATE KEY-----/.test(line)) return true;
  if (/\b(?:sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})\b/.test(line)) return true;
  const m = line.match(/(?:password|passwd|pwd|secret|token|api[_-]?key)\s*[:=]\s*["']?([^\s"']{8,})/i);
  if (!m) return false;
  const value = m[1];
  if (/^[A-Z_][A-Z0-9_]*$/.test(value)) return false;
  if (['true', 'false', 'null', 'none'].indexOf(value.toLowerCase()) !== -1) return false;
  if (/[<>{}]/.test(value)) return false;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(function (re) { return re.test(value); }).length;
  return value.length >= 12 && classes >= 2;
}
function hasSecret(text) {
  return text.split(/\r?\n/).some(looksLikeSecret);
}

function parseFrontmatter(text) {
  if (!text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return null;
  const fm = text.slice(3, end);
  const name = (fm.match(/^name:\s*(.+)$/m) || [])[1];
  const description = (fm.match(/^description:\s*(.+)$/m) || [])[1];
  return {
    fm,
    name: name ? name.trim().replace(/^["']|["']$/g, '') : null,
    description: description ? description.trim().replace(/^["']|["']$/g, '') : null
  };
}

function collectReferences(text) {
  const refs = new Set();
  let m;
  const link = /\[[^\]]*\]\(([^)]+)\)/g;
  while ((m = link.exec(text))) refs.add(m[1].trim());
  const code = /`([^`]+)`/g;
  while ((m = code.exec(text))) refs.add(m[1].trim());
  return Array.from(refs).filter(function (ref) {
    if (!ref || ref.startsWith('http://') || ref.startsWith('https://') || ref.startsWith('#')) return false;
    if (ref.startsWith('mailto:')) return false;
    return /^(?:\.\/)?(?:references|scripts|assets)\//.test(ref);
  });
}

function lint(skillDir) {
  const errors = [];
  const warnings = [];
  const info = [];
  const ignores = loadIgnores(skillDir);
  const skillFile = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillFile)) {
    errors.push('missing SKILL.md');
    return { errors, warnings, info, skillDir };
  }

  const raw = fs.readFileSync(skillFile);
  const text = raw.toString('utf8');
  const fm = parseFrontmatter(text);
  if (!fm) {
    errors.push('SKILL.md must start with a YAML frontmatter block');
  } else {
    if (!fm.name) errors.push('frontmatter is missing name');
    else {
      if (fm.name.length > 64) warnings.push('name is longer than 64 characters');
      if (!NAME_RE.test(fm.name)) warnings.push('name must be lowercase ASCII hyphen-case');
      const folder = path.basename(path.resolve(skillDir));
      if (fm.name !== folder && !ignored(ignores, 'name-match', 'SKILL.md')) warnings.push('name "' + fm.name + '" must match folder name "' + folder + '"');
    }
    if (!fm.description) errors.push('frontmatter is missing description');
    else {
      if (fm.description.length > DESCRIPTION_MAX_CHARS) errors.push('description is longer than ' + DESCRIPTION_MAX_CHARS + ' characters');
      else if (fm.description.length < 40) warnings.push('description is very short; trigger quality may suffer');
      const contract = validateTriggerContract(fm.description);
      for (const issue of contract.errors) errors.push('trigger contract: ' + issue);
    }
  }

  if (raw.length >= 3 && raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF) {
    errors.push('SKILL.md has a UTF-8 BOM');
  }
  if (text.includes('\r\n')) warnings.push('SKILL.md uses CRLF; prefer LF for portability');

  const lines = text.split(/\r?\n/).length;
  const bytes = Buffer.byteLength(text, 'utf8');
  if (lines > SKILL_MAX_LINES) warnings.push('SKILL.md has ' + lines + ' lines; keep the entrypoint lean');
  if (bytes > SKILL_MAX_BYTES) warnings.push('SKILL.md is ' + bytes + ' bytes; move conditional detail to references');
  info.push('SKILL.md: ' + lines + ' lines, ' + bytes + ' bytes');

  if (ABSOLUTE_PATH_RE.test(text) && !ignored(ignores, 'absolute-path', 'SKILL.md')) warnings.push('SKILL.md contains an absolute local path');
  if (hasSecret(text) && !ignored(ignores, 'secret-like', 'SKILL.md')) warnings.push('SKILL.md contains a secret-like string; verify it is not a credential');

  for (const ref of collectReferences(text)) {
    const local = ref.replace(/^\.\//, '').split('#')[0];
    const full = path.join(skillDir, local);
    if (!fs.existsSync(full)) errors.push('referenced path does not exist: ' + ref);
  }

  const files = [];
  function walk(dir, base) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = base ? base + '/' + entry.name : entry.name;
      if (entry.isDirectory()) walk(full, rel);
      else if (entry.isFile() && /\.(md|json|js|ts|py|sh|ya?ml)$/i.test(entry.name)) files.push({ full, rel });
    }
  }
  walk(skillDir, '');

  for (const file of files) {
    if (file.rel === 'SKILL.md') continue;
    const body = fs.readFileSync(file.full, 'utf8');
    if (ABSOLUTE_PATH_RE.test(body) && !ignored(ignores, 'absolute-path', file.rel)) warnings.push(file.rel + ' contains an absolute local path');
    if (hasSecret(body) && !ignored(ignores, 'secret-like', file.rel)) warnings.push(file.rel + ' contains a secret-like string; verify it is not a credential');
  }

  const openaiYaml = path.join(skillDir, 'agents', 'openai.yaml');
  if (fs.existsSync(openaiYaml)) {
    const y = fs.readFileSync(openaiYaml, 'utf8');
    const short = (y.match(/short_description:\s*["']?(.*?)["']?\s*$/m) || [])[1];
    if (short && (short.length < 25 || short.length > 64)) {
      warnings.push('agents/openai.yaml short_description should be 25-64 characters');
    }
  }

  return { errors, warnings, info, skillDir };
}

module.exports = function run(argv) {
  const args = parseArgs(argv);
  const skillDir = args._[0];
  if (!skillDir) {
    process.stderr.write('Usage: skillcanary lint <skill-dir>\n');
    return 2;
  }
  const result = lint(skillDir);
  if (args.json) {
    printJson(result);
  } else {
    process.stdout.write('SkillCanary lint @ ' + path.resolve(skillDir) + '\n');
    for (const item of result.info) process.stdout.write('  i ' + item + '\n');
    for (const item of result.warnings) process.stdout.write('  ! ' + item + '\n');
    for (const item of result.errors) process.stdout.write('  x ' + item + '\n');
    process.stdout.write('  Result: ' + (result.errors.length ? 'FAIL' : (result.warnings.length ? 'WARN' : 'PASS')) + '\n');
  }
  if (result.errors.length) return 1;
  if (args.strict && result.warnings.length) return 1;
  return 0;
};

module.exports.lint = lint;