'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function sha256File(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function number(value) { return Number.isFinite(Number(value)) ? Number(value) : null; }
function usageRecord(cliFile, gradingFile, root) {
  const cli = readJson(cliFile);
  const grading = readJson(gradingFile);
  const usage = cli.usage || {};
  const runId = grading.run_id || path.relative(root, path.dirname(path.dirname(cliFile))).split(path.sep).join('/');
  const summary = grading.summary || {};
  const status = Number(summary.failed) === 0 ? 'success' : 'failure';
  const tools = grading.execution_metrics && grading.execution_metrics.tool_calls || {};
  const input = number(usage.input_tokens) || 0;
  const output = number(usage.output_tokens) || 0;
  const cacheRead = number(usage.cache_read_input_tokens) || 0;
  return {
    schema_version: 'autoarmory/usage-record/v1',
    id: 'usage-' + crypto.createHash('sha256').update(runId + ':' + sha256File(cliFile) + ':' + sha256File(gradingFile)).digest('hex').slice(0, 16),
    source_decision_id: runId,
    run_id: runId,
    usage_sha256: sha256File(cliFile),
    outcome_sha256: sha256File(gradingFile),
    cost_usd: number(cli.total_cost_usd),
    tokens: { input: input, output: output, cache_read: cacheRead, total: input + output },
    outcome: { status: status, pass_rate: number(summary.pass_rate), passed: number(summary.passed) || 0, failed: number(summary.failed) || 0, total: number(summary.total) || 0 },
    skill_invoked: Number(tools.Skill || 0) > 0,
    tool_calls: number(grading.execution_metrics && grading.execution_metrics.total_tool_calls) || 0,
    observed_at: fs.statSync(gradingFile).mtime.toISOString()
  };
}
function collectUsageRecords(rootDir) {
  const root = path.resolve(rootDir);
  const records = [];
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (entry.name !== 'cli.json') continue;
      const runDir = path.dirname(path.dirname(full));
      const grading = path.join(runDir, 'grading.json');
      if (!fs.existsSync(grading)) continue;
      records.push(usageRecord(full, grading, root));
    }
  }
  walk(root);
  return records.sort(function (a, b) { return a.run_id.localeCompare(b.run_id); });
}
module.exports = { collectUsageRecords, usageRecord, sha256File };