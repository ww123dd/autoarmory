'use strict';

// Acceptance test for 1.4.0: the inventory scan is gap-first, read-only and secret-safe.
//
//   1. a skill with frontmatter yields a candidate carrying its trigger text and a source hash
//   2. a skill without a description is reported as a gap, not as ready
//   3. an MCP server contributes its name and shape only - never an env value
//   4. profile verifiers become evaluator candidates with evidence_refs
//   5. the scan does not modify anything it reads (hashes unchanged)
//   6. --write writes the candidate file; without it nothing is written

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SCAN = path.join(ROOT, 'scripts', 'inventory-scan.js');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-inventory-'));
const home = path.join(work, 'home');
const repo = path.join(work, 'repo');
const state = path.join(work, 'state');
const SECRET = 'sk-live-super-secret-value';

function must(condition, message) { if (!condition) throw new Error(message); }
function write(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2), 'utf8'); }
function sha(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }

write(path.join(home, '.codex', 'skills', 'alpha', 'SKILL.md'), ['---', 'name: alpha-skill', 'description: Use when the task needs alpha handling; do not use for beta work.', '---', '', '# Alpha', ''].join('\n'));
write(path.join(home, '.codex', 'skills', 'beta', 'SKILL.md'), ['---', 'name: beta-skill', '---', '', '# Beta without a description', ''].join('\n'));
write(path.join(home, '.codex', 'mcp.json'), { mcpServers: { doris: { command: 'node', args: ['/opt/mcp/index.js'], env: { MYSQL_PASSWORD: SECRET } } } });
write(path.join(repo, 'verifiers.lock.json'), { schema_version: 'autoarmory/verifiers-lock/v1', verifiers: [{ id: 'file-sha256-license', kind: 'file-sha256', readonly: true, statement: 'the file must match its digest', adapter: 'scripts/verify/state-query.js', bridge: { adapter: 'examples/adapters/file-sha256/bridge.js' } }] });

const watched = [
  path.join(home, '.codex', 'skills', 'alpha', 'SKILL.md'),
  path.join(home, '.codex', 'skills', 'beta', 'SKILL.md'),
  path.join(home, '.codex', 'mcp.json'),
  path.join(repo, 'verifiers.lock.json')
];
const before = watched.map(sha);

function run(args) {
  const result = spawnSync(process.execPath, [SCAN].concat(args), { cwd: ROOT, encoding: 'utf8', windowsHide: true });
  return { code: result.status, out: result.stdout || '', err: result.stderr || '' };
}

// 6a: no --write means no file
let result = run(['--home', home, '--repo', repo, '--state', state, '--json']);
must(result.code === 0, 'scan must succeed: ' + result.out + result.err);
const report = JSON.parse(result.out);
must(!fs.existsSync(path.join(state, 'inventory-candidates.jsonl')), 'a scan without --write must not write a candidate file');

// 1
const alpha = report.candidates.filter(function (item) { return item.id === 'skill:alpha-skill'; })[0];
must(alpha, 'the alpha skill must be discovered');
must(/alpha handling/.test(alpha.trigger.when_to_use) && alpha.trigger.source === 'frontmatter.description', 'the trigger text must come from the skill own description');
must(alpha.source.sha256 === sha(watched[0]) && alpha.source.path === watched[0], 'the candidate must carry the source path and hash');
must(alpha.trigger_surface.status === 'raw_metadata' && alpha.trigger_surface.curated === false, 'raw metadata must be labelled as uncurated, not presented as a routing surface');
must(alpha.evidence_status === 'unassigned' && alpha.judgment_required.indexOf('evidence_refs') !== -1, 'the scan must not invent the verifier that should prove a skill');
must(alpha.readiness.registerable === false && alpha.readiness.facts_consistent === true, 'a scanned candidate is fact-consistent but never registerable');
must(report.summary.registerable === 0, 'a scan alone must never produce a registerable candidate');

// 2
const beta = report.candidates.filter(function (item) { return item.id === 'skill:beta-skill'; })[0];
must(beta && beta.readiness.gaps.indexOf('no_trigger') !== -1, 'a skill without a description must be reported as no_trigger');

// 2b: the falsifier - the scan must agree with the filesystem it read
const second = JSON.parse(run(['--home', home, '--repo', repo, '--state', state, '--json']).out);
const factsOf = function (r) { return r.candidates.map(function (c) { return c.id + ':' + c.source.sha256; }).sort().join('|'); };
must(factsOf(second) === factsOf(report), 'two scans of the same filesystem must produce the same facts');
const walked = [];
(function walk(dir) { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) walk(full); else if (entry.name === 'SKILL.md') walked.push(full); } })(path.join(home, '.codex', 'skills'));
const scannedSkills = report.candidates.filter(function (c) { return c.kind === 'skill'; });
must(walked.length === scannedSkills.length, 'the scan must cover exactly the skill files that exist (' + scannedSkills.length + ' of ' + walked.length + ')');
for (const candidate of scannedSkills) must(candidate.source.sha256 === sha(candidate.source.path), candidate.id + ': the recorded hash must equal the file on disk');


// 3
must(result.out.indexOf(SECRET) === -1 && result.err.indexOf(SECRET) === -1, 'an env value must never appear in the scan output');
const mcp = report.candidates.filter(function (item) { return item.id === 'mcp:doris'; })[0];
must(mcp && mcp.kind === 'mcp-gateway' && mcp.source.sha256 === sha(watched[2]), 'the MCP candidate must carry the config hash');
must(JSON.stringify(mcp).indexOf(SECRET) === -1, 'the MCP candidate must not embed the secret');

// 4
const verifier = report.candidates.filter(function (item) { return item.id === 'verifier:file-sha256-license'; })[0];
must(verifier && verifier.kind === 'evaluator' && verifier.evidence_refs[0] === 'file-sha256-license', 'a profile verifier must become an evaluator candidate with evidence_refs');
must(verifier.evidence_status === 'registered' && verifier.readiness.registerable === false, 'a verifier brings registered evidence but still needs judgment (curated trigger, task types) before registration');

// 5
must(watched.map(sha).join(',') === before.join(','), 'the scan must not modify anything it read');

write(watched[0], fs.readFileSync(watched[0], 'utf8') + '\n<!-- changed -->\n');
const afterChange = JSON.parse(run(['--home', home, '--repo', repo, '--state', state, '--json']).out);
const alphaAfter = afterChange.candidates.filter(function (c) { return c.id === 'skill:alpha-skill'; })[0];
must(alphaAfter.source.sha256 !== alpha.source.sha256, 'a changed file must produce a changed hash (scan vs filesystem drift is detectable)');

// 6b
result = run(['--home', home, '--repo', repo, '--state', state, '--write', '--json']);
must(result.code === 0 && fs.existsSync(path.join(state, 'inventory-candidates.jsonl')), '--write must write the candidate file');

console.log('inventory tests passed: trigger from metadata, missing description=gap, env values never emitted, verifiers carry evidence, inputs untouched, --write writes');