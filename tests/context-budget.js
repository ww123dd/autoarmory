'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { contextBudget, budgetEscapes } = require('../src/lib/context-budget');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-context-budget-'));
function write(rel, value) { const file = path.join(root, rel); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value, 'utf8'); return file; }
function must(condition, message) { if (!condition) throw new Error(message); }
const skill = write('SKILL.md', '# Skill\n\nSee [a](references/a.md).\n');
const a = write('references/a.md', 'See [b](b.md).\n');
const b = write('references/b.md', 'leaf\n');
const orphan = write('orphan.md', 'orphan\n');
const appendix = write('appendix/large.txt', 'x'.repeat(300));
const report = contextBudget(root);
must(report.ok, 'context budget must run');
must(report.metrics.always_loaded_bytes === fs.statSync(skill).size, 'always loaded bytes');
must(report.metrics.referenced_bytes === fs.statSync(a).size + fs.statSync(b).size, 'referenced bytes');
must(report.metrics.orphan_bytes === fs.statSync(orphan).size + fs.statSync(appendix).size, 'orphan bytes');
must(report.metrics.appendix_bytes === fs.statSync(appendix).size, 'appendix bytes');
must(report.metrics.referenced_file_count === 2, 'referenced file count');
must(report.metrics.max_link_depth === 2, 'link depth');
const escapes = budgetEscapes(report.metrics, { max_always_loaded_bytes: 1, max_appendix_bytes: 10 });
must(escapes.count === 2, 'budget escapes must be counted');
const missing = contextBudget(path.join(root, 'missing'));
must(missing.ok === false, 'missing SKILL.md must fail closed');
console.log('context budget tests passed: always/referenced/orphan/appendix bytes, link depth, budget escapes, missing skill');