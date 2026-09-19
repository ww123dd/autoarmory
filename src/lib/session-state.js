'use strict';
const fs = require('fs');
const path = require('path');
const { sha256, readJson, writeJson } = require('./util');
function stateFile(stateDir, session) { return path.join(stateDir, 'sessions', sha256(path.resolve(session)).slice(0, 16) + '.json'); }
function load(stateDir, session, offset) {
  const file = stateFile(stateDir, session);
  if (!fs.existsSync(file)) return { offset: offset || 0, seen_ids: {}, signatures: {}, high_signal_crossed: {} };
  try { return Object.assign({ offset: offset || 0, seen_ids: {}, signatures: {}, high_signal_crossed: {} }, readJson(file)); }
  catch (_) { return { offset: offset || 0, seen_ids: {}, signatures: {}, high_signal_crossed: {} }; }
}
function save(stateDir, session, value) {
  const file = stateFile(stateDir, session);
  writeJson(file, Object.assign({ schema_version: 'autoarmory/session-state/v1', session_file: path.resolve(session), updated_at: new Date().toISOString() }, value), { backup: false });
  return { offset: value.offset || 0, state_file: path.relative(stateDir, file).replace(/\\/g, '/') };
}
module.exports = { stateFile, load, save };