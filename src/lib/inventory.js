'use strict';

// Read-only inventory scan: what modules does this operator actually have?
//
// Gap-first (the Agent Skills guidance): the scan proposes, it does not register. Each
// candidate carries where it came from (path + sha256), the trigger surface harvested from
// its own metadata, and the evidence that could prove it. Candidates missing any of those
// are reported as gaps instead of being dressed up as ready.
//
// Two hard rules:
//   1. read-only - the scan never writes to the directories it reads;
//   2. no credentials - MCP entries contribute their name, command basename and argument
//      count, never an env value or an argument value.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { readJsonl } = require('./util');

const SKIP_DIRS = new Set(['.archive', '.git', 'node_modules']);
function sha256File(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }

function parseFrontmatter(text) {
  const match = String(text).match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    let value = kv[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    meta[kv[1]] = value;
  }
  return meta;
}

function walkSkills(root, out) {
  if (!fs.existsSync(root)) return;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { continue; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        stack.push(full);
      } else if (entry.isFile() && entry.name === 'SKILL.md') {
        out.push(full);
      }
    }
  }
}

function skillCandidate(file) {
  const text = fs.readFileSync(file, 'utf8');
  const meta = parseFrontmatter(text) || {};
  const fallbackName = path.basename(path.dirname(file));
  const name = meta.name || fallbackName;
  const description = meta.description || null;
  return {
    schema_version: 'autoarmory/inventory-candidate/v1',
    id: 'skill:' + name,
    kind: 'skill',
    name: name,
    source: { type: 'skill-file', path: file, sha256: sha256File(file) },
    trigger: { when_to_use: description, when_not_to_use: null, source: description ? 'frontmatter.description' : null },
    trigger_surface: { status: description ? 'raw_metadata' : 'missing', raw: description, curated: false, needs_curation: true },
    capabilities: [],
    evidence_refs: [],
    lifecycle: 'candidate'
  };
}

function mcpCandidates(configFile) {
  const candidates = [];
  if (!fs.existsSync(configFile)) return candidates;
  const configSha = sha256File(configFile);
  let config;
  try { config = JSON.parse(fs.readFileSync(configFile, 'utf8')); } catch (_) { return candidates; }
  for (const [name, entry] of Object.entries(config.mcpServers || {})) {
    candidates.push({
      schema_version: 'autoarmory/inventory-candidate/v1',
      id: 'mcp:' + name,
      kind: 'mcp-gateway',
      name: name,
      source: { type: 'mcp-config', path: configFile, sha256: configSha, entry_sha256: crypto.createHash('sha256').update(JSON.stringify(entry && entry.command || '') + '|' + String((entry && entry.args || []).length)).digest('hex') },
      trigger: { when_to_use: null, when_not_to_use: null, source: null },
      trigger_surface: { status: 'missing', raw: null, curated: false, needs_curation: true },
      capabilities: [],
      evidence_refs: [],
      lifecycle: 'candidate'
    });
  }
  return candidates;
}

function verifierCandidates(profileFile) {
  if (!fs.existsSync(profileFile)) return [];
  let lock;
  try { lock = JSON.parse(fs.readFileSync(profileFile, 'utf8')); } catch (_) { return []; }
  return (lock.verifiers || []).map(function (item) {
    return {
      schema_version: 'autoarmory/inventory-candidate/v1',
      id: 'verifier:' + item.id,
      kind: 'evaluator',
      name: item.id,
      source: { type: 'verifier-profile', path: profileFile, sha256: sha256File(profileFile), bridge: item.bridge ? item.bridge.adapter : null },
      trigger: { when_to_use: item.statement || null, when_not_to_use: null, source: item.statement ? 'verifier.statement' : null },
      trigger_surface: { status: item.statement ? 'raw_metadata' : 'missing', raw: item.statement || null, curated: false, needs_curation: true },
      capabilities: [],
      evidence_refs: [item.id],
      evidence_status: 'registered',
      lifecycle: 'candidate'
    };
  });
}

function scan(options) {
  const opts = options || {};
  const home = path.resolve(opts.home || os.homedir());
  const repo = path.resolve(opts.repo || process.cwd());
  const skillRoots = (opts.skillRoots || [path.join(home, '.codex', 'skills'), path.join(home, '.claude', 'skills')]).filter(function (dir) { return fs.existsSync(dir); });
  const files = [];
  for (const root of skillRoots) walkSkills(root, files);
  const candidates = files.map(skillCandidate)
    .concat(mcpCandidates(opts.mcpConfig || path.join(home, '.codex', 'mcp.json')))
    .concat(verifierCandidates(opts.profile || path.join(repo, 'verifiers.lock.json')));

  // A scan produces facts (path, hash, existence, registered ids). It cannot produce
  // judgment: a curated trigger surface, the verifier that should prove this module, or
  // the task types it serves. Those are listed as judgment_required and never invented.
  for (const candidate of candidates) {
    if (!candidate.evidence_status) candidate.evidence_status = 'unassigned';
    const gaps = [];
    if (!candidate.trigger.when_to_use) gaps.push('no_trigger');
    if (!candidate.evidence_refs.length) gaps.push('no_evidence');
    if (!candidate.capabilities.length) gaps.push('no_task_types');
    candidate.judgment_required = ['trigger_curation']; 
    if (!candidate.evidence_refs.length) candidate.judgment_required.push('evidence_refs');
    candidate.judgment_required.push('task_types');
    candidate.facts_consistent = true;
    candidate.readiness = {
      facts_consistent: true,
      judgment_complete: false,
      registerable: false,
      gaps: gaps,
      judgment_required: candidate.judgment_required
    };
  }

  const byKind = {};
  const gapCount = { no_trigger: 0, no_evidence: 0, no_task_types: 0 };
  for (const candidate of candidates) {
    byKind[candidate.kind] = (byKind[candidate.kind] || 0) + 1;
    for (const gap of candidate.readiness.gaps) gapCount[gap] += 1;
  }
  return {
    schema_version: 'autoarmory/inventory/v1',
    generated_at: new Date().toISOString(),
    home: home,
    repo: repo,
    skill_roots: skillRoots,
    candidates: candidates,
    summary: {
      scanned: candidates.length,
      by_kind: byKind,
      registerable: 0,
      judgment_complete: 0,
      facts_consistent: candidates.length,
      needs_attention: candidates.filter(function (item) { return !item.readiness.registerable; }).length,
      gaps: gapCount
    }
  };
}

module.exports = { scan, parseFrontmatter, sha256File };