'use strict';

const registry = require('./command-family');

function normalizeCommand(command) {
  const text = String(command || '').trim();
  if (!text) return { primary_command: null, command_family: null, candidate_transition: null, meta_kinds: [], observed_facts: {} };
  const result = registry.classify(text);
  const metaKinds = result.meta_kinds;
  if (result.transition) return { primary_command: text, command_family: result.family, candidate_transition: result.transition, meta_kinds: metaKinds, observed_facts: { command: text, command_family: result.family, meta_kinds: metaKinds } };
  const primaryMeta = metaKinds.indexOf('file_write') !== -1 ? 'file_write' : (metaKinds[0] || 'unknown');
  return { primary_command: null, command_family: null, candidate_transition: null, meta_kinds: metaKinds, observed_facts: { command: text, meta_kind: primaryMeta, meta_kinds: metaKinds } };
}
module.exports = { normalizeCommand, FAMILIES: registry.FAMILIES, META: registry.META };
