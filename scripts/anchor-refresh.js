#!/usr/bin/env node
'use strict';

// Re-verify every vendored anchor against the publisher that produced it.
//
// Offline (default): recompute the published digest from the vendored bytes.
// --fetch          : re-download through the channel named in the provenance record and
//                    compare the fresh bytes with the vendored ones. HTTP goes through
//                    the audited egress wrapper when it exists locally, with --raw so the
//                    bytes survive; nothing returns to the agent except the hash.
//
// usage: node scripts/anchor-refresh.js [--fetch] [--json] [--keep]

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ANCHORS = path.join(ROOT, 'examples', 'anchors');
const EGRESS = process.env.AGENT_GUARD_EGRESS || 'C:/Users/Administrator/Desktop/Codex/agent-guard/tools/egress.js';
const flag = function (name) { return process.argv.indexOf(name) >= 0; };
const arg = function (name, fallback) { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback; };

function digestOf(bytes, algorithm, encoding) {
  if (algorithm === 'git-blob-sha1') {
    return crypto.createHash('sha1').update(Buffer.concat([Buffer.from('blob ' + bytes.length + '\0', 'utf8'), bytes])).digest(encoding);
  }
  return crypto.createHash(algorithm).update(bytes).digest(encoding);
}
function pythonCommand() {
  const candidates = [process.env.PYTHON, 'python', 'python3', 'py', 'C:/ProgramData/anaconda3/python.exe'].filter(Boolean);
  for (const candidate of candidates) {
    const probe = cp.spawnSync(candidate, ['--version'], { encoding: 'utf8', windowsHide: true, shell: candidate === 'py' });
    if (probe.status === 0) return candidate;
  }
  return null;
}
function fetchTo(command, args, target) {
  const result = cp.spawnSync(command, args, { encoding: 'utf8', windowsHide: true, shell: false });
  return result;
}
function egressFetch(url, target) {
  if (fs.existsSync(EGRESS)) {
    const result = cp.spawnSync(process.execPath, [EGRESS, url, '--output', target, '--raw', '--max-bytes', '5000000'], { encoding: 'utf8', windowsHide: true });
    if (result.status !== 0) throw new Error('egress failed: ' + String(result.stderr || result.stdout).slice(0, 200));
    return 'egress --raw';
  }
  throw new Error('no audited egress wrapper found; set AGENT_GUARD_EGRESS to use the HTTP channel');
}

const records = fs.readdirSync(ANCHORS).filter(function (name) { return name.endsWith('.provenance.json'); }).sort();
if (!records.length) { process.stderr.write('no provenance records in ' + ANCHORS + '\n'); process.exit(2); }
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-anchor-refresh-'));
const rows = [];
let failures = 0;

for (const name of records) {
  const record = JSON.parse(fs.readFileSync(path.join(ANCHORS, name), 'utf8'));
  const vendored = fs.readFileSync(path.join(ROOT, record.artifact));
  const row = { record: name, artifact: record.artifact, publisher: record.publisher, channel: record.fetcher ? record.fetcher.kind : 'unknown', offline_ok: false, fetch: null, fetch_ok: null, error: null };
  try {
    const recomputed = digestOf(vendored, record.algorithm, record.encoding);
    row.offline_ok = recomputed === record.published_digest;
    if (!row.offline_ok) throw new Error('vendored bytes do not match ' + record.published_digest);
    row.published = record.published_digest.slice(0, 16) + '...';
  } catch (error) {
    row.error = error.message;
    failures += 1;
    rows.push(row);
    continue;
  }
  if (!flag('--fetch')) { rows.push(row); continue; }

  try {
    const dir = fs.mkdtempSync(path.join(work, 'one-'));
    const target = path.join(dir, path.basename(record.artifact));
    const kind = record.fetcher && record.fetcher.kind;
    if (kind === 'npm-pack') {
      const result = cp.spawnSync('npm', ['pack', record.fetcher.package, '--registry', record.fetcher.registry, '--pack-destination', dir], { encoding: 'utf8', windowsHide: true, shell: true });
      if (result.status !== 0) throw new Error('npm pack failed: ' + String(result.stderr || result.stdout).slice(0, 200));
    } else if (kind === 'pip-download') {
      const python = pythonCommand();
      if (!python) throw new Error('no python interpreter found');
      const result = cp.spawnSync(python, ['-m', 'pip', 'download', record.fetcher.requirement, '--no-deps', '--no-binary', ':all:', '--dest', dir, '--disable-pip-version-check'], { encoding: 'utf8', windowsHide: true });
      if (result.status !== 0) throw new Error('pip download failed: ' + String(result.stderr || result.stdout).slice(0, 200));
      const published = fs.readdirSync(dir).filter(function (n) { return /\.(tar\.gz|zip|whl)$/.test(n); });
      if (published.length !== 1) throw new Error('pip download produced ' + published.length + ' artifacts');
      fs.copyFileSync(path.join(dir, published[0]), target);
    } else if (kind === 'git-clone') {
      const repoDir = path.join(dir, 'repo');
      const clone = cp.spawnSync('git', ['clone', '--quiet', '--filter=blob:none', record.fetcher.repo, repoDir], { encoding: 'utf8', windowsHide: true });
      if (clone.status !== 0) throw new Error('git clone failed: ' + String(clone.stderr || clone.stdout).slice(0, 200));
      const blob = cp.execFileSync('git', ['-C', repoDir, 'cat-file', 'blob', record.fetcher.commit + ':' + record.fetcher.path], { maxBuffer: 8 * 1024 * 1024 });
      fs.writeFileSync(target, blob);
    } else if (kind === 'http-json-digest') {
      const serviceBody = path.join(dir, 'service-body.json');
      row.via = egressFetch(record.fetcher.url, serviceBody);
      const body = JSON.parse(fs.readFileSync(serviceBody, 'utf8'));
      const list = Array.isArray(body[record.fetcher.list_field]) ? body[record.fetcher.list_field] : [];
      const match = list.filter(function (item) { return item[record.fetcher.filter_field] === record.fetcher.filter_value; })[0];
      if (!match) throw new Error('service body carries no ' + record.fetcher.filter_value + ' entry');
      let published = match;
      for (const key of record.fetcher.digest_path) published = published && published[key];
      if (published !== record.published_digest) throw new Error('service now publishes ' + String(published).slice(0, 16) + '..., expected ' + record.published_digest.slice(0, 16) + '...');
      fs.copyFileSync(path.join(ROOT, record.artifact), target);
    } else {
      throw new Error('unknown fetcher kind: ' + kind);
    }
    const fetched = fs.readFileSync(target);
    row.fetch = { bytes: fetched.length, sha256: crypto.createHash('sha256').update(fetched).digest('hex') };
    row.fetch_ok = Buffer.compare(fetched, vendored) === 0 && digestOf(fetched, record.algorithm, record.encoding) === record.published_digest;
    if (!row.fetch_ok) throw new Error('freshly fetched bytes differ from the vendored anchor');
  } catch (error) {
    row.fetch_ok = false;
    row.error = error.message;
    failures += 1;
  }
  rows.push(row);
}

const report = {
  schema_version: 'autoarmory/anchor-refresh/v1',
  generated_at: new Date().toISOString(),
  mode: flag('--fetch') ? 'fetch' : 'offline',
  channels: Array.from(new Set(rows.map(function (row) { return row.channel; }))),
  records: rows.length,
  failures: failures
};
if (flag('--json')) process.stdout.write(JSON.stringify(Object.assign(report, { rows: rows }), null, 2) + '\n');
else {
  process.stdout.write('anchor refresh (' + report.mode + '): ' + rows.length + ' records, ' + report.channels.length + ' channels\n');
  for (const row of rows) {
    const state = row.fetch_ok === null ? (row.offline_ok ? 'OFFLINE-OK' : 'FAIL') : (row.fetch_ok ? 'FETCH-OK' : 'FAIL');
    process.stdout.write('  ' + state.padEnd(11) + row.channel.padEnd(15) + path.basename(row.artifact) + (row.error ? '  ' + row.error : '') + '\n');
  }
}
const evidence = path.join(ROOT, '.selfforge', 'anchor-refresh-' + report.generated_at.replace(/[-:TZ]/g, '').slice(0, 14) + '.json');
try { fs.mkdirSync(path.dirname(evidence), { recursive: true }); fs.writeFileSync(evidence, JSON.stringify(Object.assign(report, { rows: rows }), null, 2) + '\n', 'utf8'); } catch (_) {}
if (!flag('--keep')) fs.rmSync(work, { recursive: true, force: true });
process.exit(failures ? 1 : 0);