'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseArgs } = require('../lib/util');

const SIGNAL = /(不对|不是|重来|错了|重新|修正|failed|error|exception|traceback|still not|wrong|again)/i;

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && /\.(json|jsonl|txt|md)$/i.test(entry.name)) out.push(full);
  }
}

function textFrom(file) {
  const raw = fs.readFileSync(file, 'utf8');
  if (file.endsWith('.jsonl')) {
    return raw.split(/\r?\n/).filter(Boolean).map(function (line) {
      try { return JSON.stringify(JSON.parse(line)); } catch (_) { return line; }
    }).join('\n');
  }
  if (file.endsWith('.json')) {
    try {
      const data = JSON.parse(raw);
      if (Array.isArray(data.messages)) return data.messages.map(function (m) { return typeof m === 'string' ? m : (m.content || ''); }).join('\n');
      return JSON.stringify(data);
    } catch (_) { return raw; }
  }
  return raw;
}

function firstLine(text) {
  return text.split(/\r?\n/).map(function (x) { return x.trim(); }).find(Boolean) || '';
}

module.exports = function run(argv) {
  const args = parseArgs(argv);
  const skill = args.skill;
  const source = args.sessions || args._[0];
  if (!skill || !source) {
    process.stderr.write('Usage: skillcanary scan --skill <name> --sessions <dir|file> [--output advice.jsonl]\n');
    return 2;
  }
  const files = [];
  const stat = fs.statSync(source);
  if (stat.isDirectory()) walk(source, files); else files.push(source);
  const advice = [];
  const seen = new Set();
  for (const file of files) {
    const text = textFrom(file);
    const lines = text.split(/\r?\n/).map(function (x) { return x.trim(); }).filter(function (x) { return SIGNAL.test(x); });
    for (const evidence of lines) {
      if (seen.has(evidence)) continue;
      seen.add(evidence);
      const id = 'adv-' + crypto.createHash('sha256').update(file + '|' + evidence).digest('hex').slice(0, 12);
      advice.push({
        id,
        skill,
        source_sessions: [path.resolve(file)],
        observed_failure: evidence,
        evidence,
        repro_prompt: firstLine(text),
        assertion: 'TODO: define an observable assertion before promotion.',
        frequency: 1,
        severity: 'medium',
        determinism: 'unknown',
        status: 'advice',
        expires_at: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)
      });
    }
  }
  const output = path.resolve(args.output || '.skillcanary/advice.jsonl');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, advice.map(function (x) { return JSON.stringify(x); }).join('\n') + (advice.length ? '\n' : ''), 'utf8');
  process.stdout.write('Scanned ' + files.length + ' session file(s), wrote ' + advice.length + ' advice item(s) to ' + output + '\n');
  return 0;
};