'use strict';

const fs = require('fs');
const path = require('path');
const { writeJsonl, readJsonl } = require('./util');

const BLOCK_TIERS = ['irreversible_write', 'external_side_effect'];
const EDIT_TOOLS = ['write', 'edit', 'multiedit', 'apply_patch', 'notebookedit'];

function decide(event) {
  const value = event || {};
  const kind = String(value.kind || value.type || '').toLowerCase();
  if (EDIT_TOOLS.indexOf(kind) !== -1 || value.tool && EDIT_TOOLS.indexOf(String(value.tool).toLowerCase()) !== -1) {
    return { decision: 'allow', reason: 'ordinary edit/write is record-only', action: 'record' };
  }
  if (kind === 'action' || kind === 'pre_tool_use') {
    const tier = value.action_tier || value.tier || null;
    const approved = value.approval && value.approval.status === 'approved';
    if (BLOCK_TIERS.indexOf(tier) !== -1 && !approved) return { decision: 'block', reason: 'irreversible/external action requires approval', action: 'approve' };
    return { decision: 'allow', reason: 'action is within the allowed boundary', action: 'continue' };
  }
  if (kind === 'completion' || kind === 'stop' || kind === 'task_complete') {
    const verifier = value.verifier_ref || value.verifier_id || (value.run && value.run.verifier_id);
    if (!verifier) return { decision: 'block', reason: 'completion claimed without a verifier', action: 'verify' };
    return { decision: 'allow', reason: 'completion names a verifier', action: 'continue' };
  }
  return { decision: 'allow', reason: 'no blocking rule matched', action: 'record' };
}
function gate(event, options) {
  const opts = options || {};
  const result = decide(event);
  const record = { schema_version: 'autoarmory/hook-decision/v1', at: new Date().toISOString(), event: event || {}, decision: result.decision, reason: result.reason, action: result.action };
  if (opts.state) {
    const file = path.join(opts.state, 'hook-decisions.jsonl');
    fs.mkdirSync(opts.state, { recursive: true });
    const rows = fs.existsSync(file) ? readJsonl(file) : [];
    rows.push(record);
    writeJsonl(file, rows);
  }
  return { ok: result.decision !== 'block', decision: result.decision, reason: result.reason, action: result.action, record: record };
}
module.exports = { EDIT_TOOLS, BLOCK_TIERS, decide, gate };