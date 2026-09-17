#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { parseArgs, printJson, readJson, writeJson, writeJsonl } = require('../src/lib/util');
const shadow = require('../src/lib/session-shadow');

function readVerifierIds(profile) {
  if (!profile || !fs.existsSync(profile)) return [];
  try { const lock = readJson(profile); return (lock.verifiers || []).map(function (item) { return item.id; }); } catch (_) { return []; }
}
async function readEvents(file) {
  const events = [];
  const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let row;
    try { row = JSON.parse(line); } catch (_) { continue; }
    const event = shadow.normalizeRow(row);
    if (event) events.push(event);
  }
  return events;
}
(async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sessions = [];
  const rawArgv = process.argv.slice(2);
  for (let i = 0; i < rawArgv.length; i++) if (rawArgv[i] === '--session' && rawArgv[i + 1]) sessions.push(rawArgv[++i]);
  if (!sessions.length) { process.stderr.write('Usage: node scripts/session-shadow.js --session <rollout.jsonl> [--session ...] --out <dir> [--json]\n'); process.exit(2); }
  const out = path.resolve(args.out || 'session-shadow');
  fs.mkdirSync(out, { recursive: true });
  const verifierIds = readVerifierIds(args['verifier-profile'] ? path.resolve(args['verifier-profile']) : path.resolve('verifiers.lock.json'));
  const reports = [];
  for (const session of sessions) {
    const events = await readEvents(path.resolve(session));
    const report = shadow.shadowSession(events, { session_id: path.basename(session).replace(/^rollout-.*-/, '').replace(/\.jsonl$/, ''), verifier_ids: verifierIds });
    report.session_file = path.resolve(session);
    reports.push(report);
    const sessionOut = path.join(out, report.source_session_id || 'session');
    fs.mkdirSync(sessionOut, { recursive: true });
    const mode = args.mode || 'auto';
    if (mode === 'rules' || mode === 'auto') {
      fs.writeFileSync(path.join(sessionOut, 'collaboration-rules.md'), report.rules.collaboration.map(function (x) { return '- ' + x.text; }).join('\n') + '\n', 'utf8');
      fs.writeFileSync(path.join(sessionOut, 'automation-requirements.md'), report.rules.automation.map(function (x) { return '- ' + x.text; }).join('\n') + '\n', 'utf8');
      fs.writeFileSync(path.join(sessionOut, 'hook-requirements.md'), report.rules.hooks.map(function (x) { return '- ' + x.text; }).join('\n') + '\n', 'utf8');
    }
    if (mode === 'articles' || mode === 'auto') {
      writeJsonl(path.join(sessionOut, 'article-decisions.jsonl'), report.article_decisions);
      writeJsonl(path.join(sessionOut, 'case-drafts.jsonl'), report.case_drafts);
      writeJsonl(path.join(sessionOut, 'verifier-bindings.jsonl'), report.verifier_bindings);
      writeJsonl(path.join(sessionOut, 'unverifiable.jsonl'), report.unverifiable);
    }
    writeJson(path.join(sessionOut, 'session-summary.json'), report.summary);
  }
  const aggregate = { schema_version: 'autoarmory/session-shadow-batch/v1', source_session_count: reports.length, source_sessions: reports.map(function (r) { return r.source_session_id; }), manual_case_creation_count: 0, manual_verifier_config_count: 0, manual_article_labeling_count: 0, auto_case_draft_count: reports.reduce(function (sum, r) { return sum + r.summary.auto_case_draft_count; }, 0), auto_article_decision_count: reports.reduce(function (sum, r) { return sum + r.summary.article_decisions; }, 0), reprocessed_article_count: reports.reduce(function (sum, r) { return sum + r.summary.reprocessed_article_count; }, 0), close_without_verifier_count: reports.reduce(function (sum, r) { return sum + r.summary.close_without_verifier_count; }, 0), false_close_count: reports.reduce(function (sum, r) { return sum + r.summary.false_close_count; }, 0), reports: reports };
  writeJson(path.join(out, 'session-shadow-batch.json'), aggregate);
  if (args.json) printJson(aggregate); else process.stdout.write('session shadow: sessions=' + aggregate.source_session_count + ' cases=' + aggregate.auto_case_draft_count + ' articles=' + aggregate.auto_article_decision_count + '\n');
})().catch(function (error) { process.stderr.write('session shadow failed: ' + error.message + '\n'); process.exit(1); });