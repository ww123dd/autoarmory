'use strict';
const fs = require('fs');
const readline = require('readline');
const crypto = require('crypto');
function textOf(content) { if (typeof content === 'string') return content; if (!Array.isArray(content)) return ''; return content.map(function (item) { return item && (item.text || item.input_text || item.output_text || item.content || ''); }).filter(Boolean).join('\n'); }
function messageOf(row) { const p = row.payload || row; const content = p.content || (p.message && p.message.content); const role = p.role || (p.message && p.message.role) || (row.type === 'user' ? 'user' : (row.type === 'assistant' ? 'assistant' : null)); const text = textOf(content); if (!role || !text) return null; return { line: row.__line, id: p.id || row.uuid || null, role: role, text: text, observedAt: row.timestamp || p.timestamp || null }; }
async function readMessages(sessionFile) { const rows = []; const rl = readline.createInterface({ input: fs.createReadStream(sessionFile), crlfDelay: Infinity }); let line = 0; for await (const raw of rl) { line += 1; let row; try { row = JSON.parse(raw); } catch (_) { continue; } row.__line = line; const message = messageOf(row); if (message) rows.push(message); } return rows; }
function decide(text) { if (/拒绝|不融入|不加入|不做|不采用/.test(text)) return 'reject'; if (/延后|暂不|backlog|后续再|先不/.test(text)) return 'defer'; if (/吸收|落地|加入机制|机制|清单|优化完成|新增|修复/.test(text)) return 'absorb'; return null; }
function parts(text, pattern) { return String(text).split(/\r?\n/).map(function (line) { return line.trim(); }).filter(function (line) { return line && pattern.test(line); }).slice(0, 20); }
function verificationRuns(text) { const out = []; for (const match of String(text).matchAll(/([A-Za-z0-9_./-]*(?:genericity-check|self-evolution-check|verification-gap|selfcheck|budgetcheck)[A-Za-z0-9_./-]*)/ig)) out.push(match[1]); return Array.from(new Set(out)); }
async function extractSession(sessionFile, summons) {
  const messages = await readMessages(sessionFile);
  const out = [];
  for (let index = 0; index < summons.length; index += 1) {
    const summon = summons[index];
    const startLine = Number(String(summon.source_ref).split('#L').pop());
    const endLine = index + 1 < summons.length ? Number(String(summons[index + 1].source_ref).split('#L').pop()) : Infinity;
    const slice = messages.filter(function (message) { return message.line > startLine && message.line < endLine; });
    const assistantText = slice.filter(function (message) { return message.role === 'assistant'; }).map(function (message) { return message.text; }).join('\n');
    if (!assistantText) continue;
    let decision = decide(assistantText);
    if ((summon.requested_action === 'summarize_recent_problems' || summon.requested_action === 'optimize_skill') && /把.*做成|落地|新增|补.*检查|机制/.test(assistantText)) decision = 'absorb';
    if (!decision) continue;
    const reasonLine = String(assistantText).split(/\r?\n/).find(function (line) { return decision === 'absorb' ? /吸收|落地|机制/.test(line) : decision === 'reject' ? /拒绝|不融入|不加入/.test(line) : /延后|暂不|backlog/.test(line); }) || '';
    const sed = {
      schema_version: 'autoarmory/skill-sediment/v1',
      sediment_id: 'sediment-' + crypto.createHash('sha256').update(summon.summon_id + ':' + decision).digest('hex').slice(0, 16),
      summon_id: summon.summon_id,
      source_input: [summon.user_instruction],
      decision: decision,
      target_skill: summon.target_skill,
      absorb_parts: decision === 'absorb' ? parts(assistantText, /吸收|落地|机制|清单|检查/) : [],
      mechanism_parts: parts(assistantText, /单一|混合态|验证缺口|反例|条件/),
      reject_parts: decision === 'reject' ? parts(assistantText, /拒绝|不融入|不加入/) : [],
      defer_parts: decision === 'defer' ? parts(assistantText, /延后|暂不|后续|backlog/) : [],
      reason: reasonLine.slice(0, 500),
      proposed_change: parts(assistantText, /吸收|落地|机制|清单|检查/)[0] || null,
      verification_run: verificationRuns(assistantText),
      evidence_refs: slice.filter(function (message) { return message.role === 'assistant' && message.id; }).map(function (message) { return message.id; }),
      status: 'candidate'
    };
    out.push(sed);
  }
  return out;
}
module.exports = { extractSession, readMessages, decide };