'use strict';
const fs = require('fs');
const readline = require('readline');
const crypto = require('crypto');
function textOf(content) { if (typeof content === 'string') return content; if (!Array.isArray(content)) return ''; return content.map(function (item) { return item && (item.text || item.input_text || item.content || ''); }).filter(Boolean).join('\n'); }
function messageOf(row) {
  const p = row.payload || row;
  const content = p.content || (p.message && p.message.content);
  const role = p.role || (p.message && p.message.role) || (row.type === 'user' ? 'user' : null);
  if (role !== 'user') return null;
  const text = textOf(content);
  if (!text) return null;
  const id = p.id || row.uuid || null;
  const observedAt = row.timestamp || p.timestamp || null;
  return { id: id, observedAt: observedAt, text: text };
}
function classify(text) {
  if (/总结.*问题|问题.*在哪|为什么.*测试|自测.*问题/i.test(text)) return 'summarize_recent_problems';
  if (/优化.*skill/i.test(text)) return 'optimize_skill';
  if (/有没有必要|要不要|判断/i.test(text)) return 'judge_absorb';
  return 'unknown';
}
function targetSkill(text) { return /vibe[\s-]?coding|vied\s+coding|vied\s+conding/i.test(text) ? 'vibe-coding' : null; }
async function extractSession(sessionFile) {
  const rows = [];
  const rl = readline.createInterface({ input: fs.createReadStream(sessionFile), crlfDelay: Infinity });
  let line = 0;
  for await (const raw of rl) {
    line += 1;
    let row; try { row = JSON.parse(raw); } catch (_) { continue; }
    const message = messageOf(row);
    if (!message || !/AutoArmory/i.test(message.text)) continue;
    const target = targetSkill(message.text);
    const sourceRef = sessionFile + '#L' + line;
    rows.push({
      schema_version: 'autoarmory/summon/v1',
      summon_id: 'summon-' + crypto.createHash('sha256').update(sourceRef + ':' + message.text).digest('hex').slice(0, 16),
      session_id: require('path').basename(sessionFile),
      message_id: message.id,
      observed_at: message.observedAt,
      user_instruction: message.text.trim(),
      target_skill: target,
      requested_action: classify(message.text),
      source_ref: sourceRef
    });
  }
  return rows;
}
module.exports = { extractSession, messageOf, classify, targetSkill };