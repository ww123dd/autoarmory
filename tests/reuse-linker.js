'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { linkReuseRecords } = require('../src/lib/reuse-linker');

function must(condition, message) { if (!condition) throw new Error(message); }
function write(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value, 'utf8'); }
const state = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-reuse-link-'));
write(path.join(state, 'reuse-records', 'unique.json'), JSON.stringify({ change_id: 'unique', status: 'closed' }) + '\n');
write(path.join(state, 'reuse-records', 'ambiguous.json'), JSON.stringify({ change_id: 'ambiguous', status: 'closed' }) + '\n');
write(path.join(state, 'reuse-records', 'already.json'), JSON.stringify({ change_id: 'already', status: 'closed', session_id: 's-existing', turn_id: 't-existing', source_message_id: 'm-existing' }) + '\n');
write(path.join(state, 'candidate-cases.jsonl'), [
  JSON.stringify({ change_id: 'unique', session_id: 's1', turn_id: 't1', source_message_id: 'm1' }),
  JSON.stringify({ change_id: 'ambiguous', session_id: 's2', turn_id: 't2', source_message_id: 'm2' }),
  JSON.stringify({ change_id: 'ambiguous', session_id: 's3', turn_id: 't3', source_message_id: 'm3' })
].join('\n') + '\n');

const dry = linkReuseRecords(state, {});
must(dry.linked === 1 && dry.link_lost === 1 && dry.already_linked === 1, 'dry-run must classify unique, ambiguous and already-linked');
must(JSON.parse(fs.readFileSync(path.join(state, 'reuse-records', 'unique.json'), 'utf8')).session_id === undefined, 'dry-run must not write');

const applied = linkReuseRecords(state, { apply: true });
const unique = JSON.parse(fs.readFileSync(path.join(state, 'reuse-records', 'unique.json'), 'utf8'));
const ambiguous = JSON.parse(fs.readFileSync(path.join(state, 'reuse-records', 'ambiguous.json'), 'utf8'));
const already = JSON.parse(fs.readFileSync(path.join(state, 'reuse-records', 'already.json'), 'utf8'));
must(applied.linked === 1 && applied.link_lost === 1, 'apply must report one linked and one lost');
must(unique.session_id === 's1' && unique.turn_id === 't1' && unique.source_message_id === 'm1' && unique.session_link_status === 'linked', 'unique source must fill provenance');
must(ambiguous.session_link_status === 'link_lost' && ambiguous.session_link_reason === 'ambiguous_source_sessions' && ambiguous.session_id === undefined, 'ambiguous source must not be guessed');
must(already.session_link_status === 'linked' && already.session_id === 's-existing', 'existing provenance must be preserved');
console.log('reuse linker tests passed: unique link, ambiguous link_lost, dry-run, provenance preserved');