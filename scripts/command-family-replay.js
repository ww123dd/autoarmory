#!/usr/bin/env node
'use strict';

// 2.46.0 consolidation acceptance: replay the real change-records corpus through
// the legacy command classifiers (frozen at 522d77c) and the new command-family
// registry, and require that every family assignment agrees after alias mapping.
// Every disagreement must fall into an enumerated, documented reason category.
//
//   node scripts/command-family-replay.js --baseline docs/evidence/command-family-replay-baseline.jsonl
//   node scripts/command-family-replay.js --compare docs/evidence/command-family-replay-baseline.jsonl --out docs/evidence/command-family-replay.json

const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseArgs, printJson, readJsonlStrict } = require('../src/lib/util');

// Frozen verbatim copy of no-capability-clusters.commandFamily at 522d77c (not
// exported upstream, so it lives here as the baseline reference).
function legacyClustersFamily(command) {
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

function recordsFile(args) {
  if (args.records) return path.resolve(args.records);
  return path.join(path.resolve(args.state || path.join(os.homedir(), '.codex', 'autoarmory', 'stop-shadow')), 'change-inspector', 'change-records.jsonl');
}

const args = parseArgs(process.argv.slice(2));

if (args.baseline && !args.compare) {
  // Baseline mode: run the CURRENT (pre-migration) command-normalizer plus the
  // frozen clusters classifier over every record that carries a command.
  const normalizer = require('../src/lib/command-normalizer');
  const rows = readJsonlStrict(recordsFile(args));
  const out = [];
  for (const row of rows) {
    const command = row && row.detail && typeof row.detail.command === 'string' ? row.detail.command.trim() : '';
    if (!command) continue;
    out.push({ id: row.id, command: command, old_normalizer_family: normalizer.normalizeCommand(command).command_family, old_clusters_family: legacyClustersFamily(command) });
  }
  fs.mkdirSync(path.dirname(path.resolve(args.baseline)), { recursive: true });
  fs.writeFileSync(path.resolve(args.baseline), out.map(function (r) { return JSON.stringify(r); }).join('\n') + '\n', 'utf8');
  printJson({ schema_version: 'autoarmory/command-family-replay-baseline/v1', records: rows.length, with_command: out.length, baseline_file: path.resolve(args.baseline), source_commit: '522d77c' });
  process.exit(0);
}

if (args.compare) {
  const registry = require('../src/lib/command-family');
  const baseline = readJsonlStrict(path.resolve(args.compare));
  const reasons = {
    build_split_from_test: 'command-normalizer lumped tsc/npm run build/bundle into family test; the registry splits them into build',
    build_bare_substring_tokens_dropped: 'legacy build matched bare dist/artifact/bundle substrings (e.g. Write-Output lines about artifacts became BUILD->PASS); the registry keeps only real build-tool commands and the command falls back to its true family',
    clusters_legacy_split: 'no-capability-clusters reported project_test_or_build; the registry resolves test|build per command',
    clusters_missing_family: 'no-capability-clusters had no enumeration/build/dom family, so those commands were unknown there; the registry classifies them',
    pattern_unified: 'no-capability-clusters used broader sql/process patterns (bare tokens like "sql"); the registry keeps the stricter command-normalizer patterns and the command returns to its true family',
    dom_word_boundary: 'no-capability-clusters matched dom as a substring (e.g. Get-Random); the registry requires word boundaries',
    tsc_substring_false_positive: 'the legacy test family matched bare "tsc" inside paths and filenames (tsconfig.json was read constantly in this corpus, e.g. "Get-Content tsconfig.json" became TEST->PASS); the registry anchors tool names to command position, so these return to their true family',
    family_order_unified: 'the legacy classifiers checked families in different orders (normalizer: process before http; clusters: http before process), so hybrid commands resolved differently; the registry keeps the normalizer order',
    meta_promoted_for_clustering: 'no-capability-clusters reported unknown; the registry classifies write/read/search/meta as canonical families',
    legacy_rename: 'same family, legacy id renamed by the alias map'
  };
  const alias = { test: 'test', hash: 'hash', git: 'git', process: 'process', http: 'http', sql: 'sql', enumeration: 'enumeration', build: 'build', project_test: 'test', file_hash: 'hash', process_state: 'process', git_commit: 'git', git_state: 'git', http_health: 'http', sql_count: 'sql', file_enumeration: 'enumeration' };
  const stats = { compared: 0, match: 0, by_category: {}, unexplained: [], old_disagreements: 0 };
  const patternOf = function (family) {
    const entry = registry.FAMILIES.find(function (item) { return item.id === family; });
    return entry ? entry.pattern : null;
  };
  const matchesFamily = function (family, command) {
    const pattern = patternOf(family);
    return !!(pattern && pattern.test(String(command)));
  };
  const categorize = function (oldFamily, newFamily, axis, command) {
    if (axis === 'normalizer') {
      if (oldFamily === 'test' && newFamily === 'build') return 'build_split_from_test';
      if (oldFamily === 'build' && newFamily !== 'build') return 'build_bare_substring_tokens_dropped';
      if (oldFamily === 'test' && /tsc/i.test(String(command)) && newFamily !== 'build' && newFamily !== 'test') return 'tsc_substring_false_positive';
      return null;
    }
    if (oldFamily === 'project_test_or_build' && (newFamily === 'test' || newFamily === 'build')) return 'clusters_legacy_split';
    if ((oldFamily === 'test' || oldFamily === 'project_test_or_build') && /tsc/i.test(String(command)) && newFamily !== 'build' && newFamily !== 'test') return 'tsc_substring_false_positive';
    if (oldFamily === 'unknown' && newFamily !== 'unknown' && ['write', 'read', 'search', 'meta'].indexOf(newFamily) === -1) return 'clusters_missing_family';
    if (oldFamily === 'unknown' && ['write', 'read', 'search', 'meta'].indexOf(newFamily) !== -1) return 'meta_promoted_for_clustering';
    if ((oldFamily === 'sql' || oldFamily === 'process') && newFamily !== alias[oldFamily]) return 'pattern_unified';
    if (oldFamily === 'dom' && newFamily !== 'dom') return 'dom_word_boundary';
    // both patterns match: the two legacy classifiers checked families in
    // different orders (normalizer: process before http; clusters: http before
    // process), so hybrid commands resolved differently. The registry keeps the
    // normalizer order on purpose.
    if (oldFamily && newFamily && matchesFamily(alias[oldFamily] || oldFamily, command) && matchesFamily(newFamily, command)) return 'family_order_unified';
    return null;
  };
  for (const row of baseline) {
    stats.compared += 1;
    const normOld = row.old_normalizer_family === null || row.old_normalizer_family === undefined ? 'unknown' : row.old_normalizer_family;
    if (normOld !== row.old_clusters_family && !(row.old_clusters_family === 'unknown' && normOld === 'unknown')) {
      const canonN = alias[normOld] || normOld;
      const canonC = row.old_clusters_family === 'project_test_or_build' ? null : (alias[row.old_clusters_family] || row.old_clusters_family);
      if (canonC === null ? (canonN !== 'test' && canonN !== 'build') : canonN !== canonC) stats.old_disagreements += 1;
    }
    const fresh = registry.classify(row.command);
    const newFamily = fresh.family;
    // normalizer axis: null stays null (non-transition families report no command_family there)
    const expectedNormalizer = fresh.transition ? newFamily : null;
    let cat = null;
    if ((row.old_normalizer_family || null) === expectedNormalizer || alias[row.old_normalizer_family] === expectedNormalizer) stats.match += 1;
    else {
      cat = categorize(row.old_normalizer_family, newFamily, 'normalizer', row.command);
      if (cat) stats.by_category[cat] = (stats.by_category[cat] || 0) + 1;
      else stats.unexplained.push({ id: row.id, command: String(row.command).slice(0, 160), old_normalizer_family: row.old_normalizer_family, old_clusters_family: row.old_clusters_family, new_family: newFamily });
    }
    // clusters axis
    const expectedClusters = row.old_clusters_family === 'project_test_or_build' ? (newFamily === 'build' ? 'build' : 'test') : (alias[row.old_clusters_family] || row.old_clusters_family);
    if (expectedClusters !== newFamily) {
      cat = categorize(row.old_clusters_family, newFamily, 'clusters', row.command);
      if (cat) stats.by_category[cat] = (stats.by_category[cat] || 0) + 1;
      else stats.unexplained.push({ id: row.id, command: String(row.command).slice(0, 160), old_normalizer_family: row.old_normalizer_family, old_clusters_family: row.old_clusters_family, new_family: newFamily });
    }
  }
  const report = {
    schema_version: 'autoarmory/command-family-replay/v1',
    generated_at: new Date().toISOString(),
    baseline_source_commit: '522d77c',
    compared: stats.compared,
    exact_match_after_alias: stats.match,
    old_classifier_disagreements: stats.old_disagreements,
    mismatch_categories: stats.by_category,
    mismatch_reasons: reasons,
    unexplained_count: stats.unexplained.length,
    unexplained_sample: stats.unexplained.slice(0, 20),
    negative_control: registry.classify('flibbertigibbet --nonsense /xyzzy').family === 'unknown' ? 'pass' : 'FAIL'
  };
  if (args.out) { fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true }); fs.writeFileSync(path.resolve(args.out), JSON.stringify(report, null, 2) + '\n', 'utf8'); }
  printJson(report);
  process.exit(stats.unexplained.length === 0 && report.negative_control === 'pass' ? 0 : 1);
}

process.stderr.write('usage: --baseline <file> | --compare <file> [--out <file>] [--state <dir> | --records <file>]\n');
process.exit(2);
