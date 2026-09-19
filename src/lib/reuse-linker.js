'use strict';
const fs = require('fs');
const path = require('path');
const { readJsonl, writeJson } = require('./util');

function readRows(file) {
  if (!fs.existsSync(file)) return [];
  try { return readJsonl(file); }
  catch (_) { return []; }
}

function candidateFiles(stateDir) {
  return [
    path.join(stateDir, 'candidate-cases.jsonl'),
    path.join(stateDir, 'change-inspector', 'candidate-cases.jsonl')
  ];
}

function buildIndex(stateDir) {
  const index = {};
  for (const file of candidateFiles(stateDir)) {
    for (const draft of readRows(file)) {
      const changeId = draft && (draft.change_id || draft.id);
      if (!changeId || !draft.session_id) continue;
      const key = String(changeId);
      const bySession = index[key] || (index[key] = {});
      const sessionId = String(draft.session_id);
      const current = bySession[sessionId] || { session_id: sessionId, turn_id: null, source_message_id: null, source_file: file };
      if (!current.turn_id && draft.turn_id) current.turn_id = draft.turn_id;
      if (!current.source_message_id && draft.source_message_id) current.source_message_id = draft.source_message_id;
      bySession[sessionId] = current;
    }
  }
  return index;
}

function chooseLink(index, changeId) {
  const bySession = index[String(changeId)] || null;
  if (!bySession) return { status: 'link_lost', reason: 'no_source_candidate', link: null, candidates: 0 };
  const links = Object.keys(bySession).map(function (key) { return bySession[key]; });
  if (links.length !== 1) return { status: 'link_lost', reason: 'ambiguous_source_sessions', link: null, candidates: links.length };
  return { status: 'linked', reason: null, link: links[0], candidates: 1 };
}

function linkReuseRecords(stateDir, options) {
  const opts = options || {};
  const root = path.join(stateDir, 'reuse-records');
  const files = fs.existsSync(root) ? fs.readdirSync(root).filter(function (name) { return /\.json$/i.test(name); }).sort() : [];
  const index = buildIndex(stateDir);
  const report = {
    schema_version: 'autoarmory/reuse-link/v1',
    state_root: path.resolve(stateDir),
    apply: opts.apply === true,
    examined: 0,
    already_linked: 0,
    linked: 0,
    link_lost: 0,
    updates: []
  };
  for (const name of files) {
    const file = path.join(root, name);
    let record = null;
    try { record = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (_) { continue; }
    report.examined += 1;
    const changeId = record.change_id || name.replace(/\.json$/i, '');
    if (record.session_id) {
      report.already_linked += 1;
      if (opts.apply === true && record.session_link_status !== 'linked') {
        record.session_link_status = 'linked';
        record.session_link_source = record.session_link_source || 'already_present';
        writeJson(file, record);
      }
      report.updates.push({ file: file, change_id: changeId, status: 'already_linked', session_id: record.session_id });
      continue;
    }
    const chosen = chooseLink(index, changeId);
    if (chosen.status === 'linked') {
      record.session_id = chosen.link.session_id;
      if (!record.turn_id && chosen.link.turn_id) record.turn_id = chosen.link.turn_id;
      if (!record.source_message_id && chosen.link.source_message_id) record.source_message_id = chosen.link.source_message_id;
      record.session_link_status = 'linked';
      record.session_link_source = 'candidate_draft';
      report.linked += 1;
      if (opts.apply === true) writeJson(file, record);
      report.updates.push({ file: file, change_id: changeId, status: 'linked', session_id: record.session_id });
    } else {
      record.session_link_status = 'link_lost';
      record.session_link_reason = chosen.reason;
      report.link_lost += 1;
      if (opts.apply === true) writeJson(file, record);
      report.updates.push({ file: file, change_id: changeId, status: 'link_lost', reason: chosen.reason, candidates: chosen.candidates });
    }
  }
  return report;
}

module.exports = { linkReuseRecords, buildIndex, chooseLink };