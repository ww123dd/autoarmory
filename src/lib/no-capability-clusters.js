'use strict';
const fs = require('fs');
const path = require('path');
const { readJsonlStrict, writeJson } = require('./util');

function array(value) { return Array.isArray(value) ? value : []; }
function uniq(values) { return Array.from(new Set(values.filter(Boolean).map(String))).sort(); }
function firstToken(command) { return String(command || '').trim().split(/\s+/)[0] || null; }
function commandFamily(command) {
  const text = String(command || '');
  if (/(pytest|npm test|node tests|tsc|verify_all|npm run build)/i.test(text)) return 'project_test_or_build';
  if (/(sha256|hash)/i.test(text)) return 'file_hash';
  if (/(git status|git diff|git rev-parse|git commit)/i.test(text)) return 'git_state';
  if (/(select\s|show\s|desc\s|sql|doris)/i.test(text)) return 'sql';
  if (/(curl|invoke-webrequest|https?:\/\/)/i.test(text)) return 'http';
  if (/(process|pid|tasklist|get-process|service)/i.test(text)) return 'process';
  if (/(playwright|puppeteer|browser|dom|selector)/i.test(text)) return 'dom';
  return 'unknown';
}
function scriptPath(command) {
  const match = String(command || '').match(/(?:node\s+)?([A-Za-z0-9_./\\-]+\.(?:js|ts|py|ps1|sh))/i);
  return match ? match[1].replace(/\\/g, '/') : null;
}
function features(draft) {
  const files = array(draft.changed_files).map(function (item) { return typeof item === 'string' ? item : item && item.path; }).filter(Boolean);
  const commands = array(draft.commands);
  const shape = draft.claim_shape || {};
  return {
    extensions: uniq(files.map(function (file) { const ext = path.extname(file).toLowerCase(); return ext || '(none)'; })),
    dirs: uniq(files.map(function (file) { const dir = path.dirname(String(file).replace(/\\/g, '/')); return dir === '.' ? '(root)' : dir.split('/').slice(0, 2).join('/'); })),
    external_files: files.some(function (file) { return path.isAbsolute(file) && !String(file).toLowerCase().startsWith(process.cwd().toLowerCase()); }),
    command_family: uniq(commands.map(commandFamily)),
    first_tokens: uniq(commands.map(firstToken)),
    script_paths: uniq(commands.map(scriptPath)),
    signals: uniq(array(draft.signals)),
    transition: shape.transition || draft.expected_transition || null,
    artifact_type: shape.artifact_type || draft.artifact_type || null,
    access_required: shape.access_required === true || draft.access_required === true,
    provenance: draft.expected_provenance || null,
    owner_missing: !draft.owner,
    session_id: draft.session_id || null,
    source_refs: array(draft.source_refs || draft.change_record_ids)
  };
}
function clusterKey(f) {
  return JSON.stringify({ family: f.command_family, transition: f.transition, artifact: f.artifact_type, ext: f.extensions, access: f.access_required, provenance: f.provenance });
}
function suggestedKind(f) {
  if (f.command_family.indexOf('project_test_or_build') !== -1) return 'project-test-result';
  if (f.command_family.indexOf('file_hash') !== -1) return 'file-sha256';
  if (f.command_family.indexOf('git_state') !== -1) return 'git-commit-exists';
  if (f.command_family.indexOf('sql') !== -1) return 'sql-assertion';
  if (f.command_family.indexOf('http') !== -1) return 'http-assertion';
  if (f.command_family.indexOf('process') !== -1) return 'process-state';
  if (f.command_family.indexOf('dom') !== -1) return 'dom-assertion';
  return 'unknown';
}
function feasibility(f) {
  if (['project_test_or_build', 'file_hash', 'git_state'].some(function (x) { return f.command_family.indexOf(x) !== -1; })) return 'high';
  if (f.command_family.indexOf('http') !== -1 || f.command_family.indexOf('process') !== -1) return 'medium';
  return 'low';
}
function cluster(stateDir) {
  const file = path.join(stateDir, 'decision-scan', 'no-capability.jsonl');
  const drafts = readJsonlStrict(file);
  const groups = {};
  for (const draft of drafts) {
    const f = features(draft);
    const key = clusterKey(f);
    const group = groups[key] || (groups[key] = { key: key, size: 0, features: f, exemplars: [], common_files: new Set(), common_commands: new Set(), sessions: new Set(), owners_missing: 0 });
    group.size += 1;
    if (group.exemplars.length < 5) group.exemplars.push(draft.change_id || null);
    for (const item of array(draft.changed_files)) group.common_files.add(typeof item === 'string' ? item : item && item.path);
    for (const item of array(draft.commands)) group.common_commands.add(item);
    group.sessions.add(draft.session_id || '(missing)');
    if (!draft.owner) group.owners_missing += 1;
  }
  const clusters = Object.keys(groups).map(function (key) {
    const g = groups[key];
    const f = g.features;
    return {
      cluster_id: 'cluster-' + Buffer.from(key).toString('hex').slice(0, 16),
      size: g.size,
      coverage: drafts.length ? Number((g.size / drafts.length).toFixed(6)) : 0,
      exemplars: g.exemplars,
      common_files: Array.from(g.common_files).filter(Boolean).slice(0, 10),
      common_commands: Array.from(g.common_commands).filter(Boolean).slice(0, 10),
      suggested_verifier_kind: suggestedKind(f),
      required_inputs: uniq([].concat(f.extensions ? ['path'] : [], f.transition ? ['expected_transition'] : [], f.artifact_type ? ['artifact_type'] : [])),
      expected_provenance: f.provenance ? [f.provenance] : ['baseline_manifest', 'owner_approval'],
      mechanical_feasibility: feasibility(f),
      access_required: f.access_required,
      owner_required: g.owners_missing > 0,
      session_count: g.sessions.size,
      session_link_status: g.sessions.has('(missing)') ? 'mixed' : 'linked'
    };
  }).sort(function (a, b) { const rank = { high: 0, medium: 1, low: 2 }; return (b.size - a.size) || (rank[a.mechanical_feasibility] - rank[b.mechanical_feasibility]); });
  const top10 = clusters.slice(0, 10).reduce(function (sum, item) { return sum + item.size; }, 0);
  const decisionDrafts = fs.existsSync(path.join(stateDir, 'decision-scan', 'decision-drafts.jsonl'))
    ? readJsonlStrict(path.join(stateDir, 'decision-scan', 'decision-drafts.jsonl')) : [];
  return {
    schema_version: 'autoarmory/no-capability-clusters/v1',
    input_file: file,
    total_no_capability: drafts.length,
    total_decision_drafts: decisionDrafts.length,
    cluster_count: clusters.length,
    top10_coverage: drafts.length ? Number((top10 / drafts.length).toFixed(6)) : 0,
    no_capability_rate: decisionDrafts.length ? Number((drafts.length / decisionDrafts.length).toFixed(6)) : null,
    clusters: clusters
  };
}
function writeReport(stateDir, report) {
  const out = path.join(stateDir, 'decision-scan', 'no-capability-clusters.json');
  writeJson(out, report);
  return out;
}
module.exports = { cluster, writeReport, features, clusterKey };