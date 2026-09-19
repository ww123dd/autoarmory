'use strict';
const { normalizeCommand, propose } = require('../src/lib/transition-proposer');
function must(condition, message) { if (!condition) throw new Error(message); }
must(normalizeCommand('cd repo; pytest -q').candidate_transition === 'TEST->PASS', 'cd + pytest must normalize to TEST->PASS');
must(normalizeCommand('$patch = @\'\n*** Begin Patch\nSet-Content x').observed_facts.meta_kind === 'file_write', 'patch/write must normalize to file_write');
must(normalizeCommand('[Console]::OutputEncoding=[Text.Encoding]::UTF8').observed_facts.meta_kind === 'meta_command', 'encoding setup must normalize to meta_command');
must(normalizeCommand('rg -n foo src').observed_facts.meta_kind === 'search_command', 'rg must normalize to search_command');
const proposed = propose({ change_id: 'c1', commands: ['cd repo; npm test'], signals: ['command_result_passed'], change_record_ids: ['r1'] });
must(proposed.candidate_transition === 'TEST->PASS' && proposed.source_strength === 'derived' && proposed.transition_source === 'command_shape', 'passed project test must derive a transition candidate');
const candidate = propose({ change_id: 'c2', commands: ['cd repo; pytest -q'], signals: [], change_record_ids: ['r2'] });
must(candidate.candidate_transition === 'TEST->PASS' && candidate.source_strength === 'candidate', 'command-only transition must remain candidate');
console.log('transition proposer tests passed: command normalization, TEST family, file_write/meta/search, derived vs candidate');