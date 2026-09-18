'use strict';

const crypto = require('crypto');
const { sha256 } = require('./util');

const DECISION_RE = {
  reject: /(不融入|不采纳|不要融入|拒绝融入|不适合融入|不需要|不加入|不引入|reject|do not integrate)/i,
  defer: /(暂缓|延后|后续再|以后再|下一步再|backlog|defer|以后考虑|待.*再)/i,
  absorb: /(融入|采纳|吸收|纳入|已经加入|已加入|已修改.*skill|已落地|修改了.*skill|absorb)/i
};
const RULE_KEYS = {
  collaboration: /(协作|契约|必须|禁止|不要|只允许|只保留|外部 verifier|外部事实|审批|用户只|我只需要|无感|直接做)/,
  automation: /(自动|Agent|机械动作|不用我|不需要我|不应该让我|不要让我|手动入口|手工|无感|免审批|只审批)/,
  hook: /(hook|拦截|拦住|门禁|guard|逃逸|绕过|必须被|不能继续|fail.closed|默认拒绝)/
};
const SKILLS = ['数仓开发','取数口径','元技能优化','vibe-coding','权限对账','表血缘'];
const URL_RE = /https?:\/\/[^\s<>"'`)\]}>，。；、]+/g;

function normUrl(value) {
  let raw = String(value || '').trim().replace(/[.,;]+$/, '');
  try {
    const u = new URL(raw);
    u.hash = '';
    const drop = [];
    for (const key of u.searchParams.keys()) if (/^(utm_|from|share_|spm|scene|clicktime|enter|chksm)/i.test(key)) drop.push(key);
    for (const key of drop) u.searchParams.delete(key);
    let out = u.toString();
    if (out.endsWith('/')) out = out.slice(0, -1);
    return out;
  } catch (_) { return raw; }
}
function isExternalUrl(value) { try { const host = new URL(value).hostname.toLowerCase(); if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return false; if (/^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false; return true; } catch (_) { return false; } }
function urls(text) { const out = []; const raw = String(text || '').replace(/\\_/g, '_'); const matches = raw.match(URL_RE) || []; for (const value of matches) { for (const part of String(value).split(/(?=https?:\/\/)/)) { const clean = part.replace(/[`'\"”，。；、]+$/g, ''); if (!clean) continue; const normalized = normUrl(clean); if (isExternalUrl(normalized)) out.push(normalized); } } return out; }
function textOf(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(function (item) { return item && (item.text || item.input_text || item.content || '') || ''; }).filter(Boolean).join('\n');
  if (value && typeof value === 'object') return value.text || value.content || value.message || '';
  return '';
}
function short(value, max) { return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max || 500); }
function idOf(row, payload) { return payload && payload.id || row && row.id || null; }
function turnOf(row, payload) { return row && row.internal_chat_message_metadata_passthrough && row.internal_chat_message_metadata_passthrough.turn_id || payload && payload.turn_id || null; }
function claudeEvents(row) {
  if (!row || (row.type !== 'user' && row.type !== 'assistant') || !row.message) return null;
  const content = row.message.content;
  const blocks = Array.isArray(content) ? content : [{ type: 'text', text: content }];
  const events = [];
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    const base = { timestamp: row.timestamp || null, cwd: row.cwd || null, session_id: row.sessionId || null, turn_id: row.parentUuid || null, is_sidechain: row.isSidechain === true };
    if (block.type === 'text' && block.text) events.push(Object.assign({}, base, { type: 'message', role: row.message.role === 'assistant' ? 'assistant' : 'user', id: row.uuid || null, text: short(block.text, 4000), links: urls(block.text) }));
    else if (block.type === 'tool_use') events.push(Object.assign({}, base, { type: 'tool_call', role: 'assistant', id: block.id || row.uuid || null, call_id: block.id || null, tool: block.name || null, args: short(JSON.stringify(block.input || {}), 4000), text: '', links: [] }));
    else if (block.type === 'tool_result') events.push(Object.assign({}, base, { type: 'tool_output', role: 'tool', id: row.uuid || null, call_id: block.tool_use_id || null, tool: null, args: '', is_error: block.is_error === true, text: short(textOf(block.content), 4000), links: urls(textOf(block.content)) }));
  }
  return events;
}
function normalizeRows(row) {
  if (!row || typeof row !== 'object') return [];
  const claude = claudeEvents(row);
  if (claude) return claude;
  const payload = row.payload || {};
  if (payload.type === 'message' && (payload.role === 'user' || payload.role === 'assistant')) {
    const text = short(textOf(payload.content), 4000);
    return [{ type: 'message', role: payload.role, text: text, links: urls(text), timestamp: row.timestamp || null, id: idOf(row, payload), turn_id: turnOf(row, payload) }];
  }
  if (payload.type === 'session_meta') return [{ type: 'session_meta', role: 'meta', session_id: payload.session_id || payload.id || null, cwd: payload.cwd || null, text: '', links: [], timestamp: row.timestamp || null, id: payload.session_id || payload.id || null, turn_id: null }];
  if (payload.type === 'turn_context') return [{ type: 'turn_context', role: 'meta', session_id: null, cwd: payload.cwd || null, text: '', links: [], timestamp: row.timestamp || null, id: payload.turn_id || null, turn_id: payload.turn_id || null }];
  if (payload.type === 'user_message') return [{ type: 'user_turn', role: 'user', text: short(payload.message || '', 4000), links: urls(payload.message || ''), timestamp: row.timestamp || null, id: payload.client_id || null, turn_id: payload.turn_id || null }];
  if (payload.type === 'task_complete') return [{ type: 'completion', role: 'assistant', text: short(payload.last_agent_message || '', 4000), links: urls(payload.last_agent_message || ''), timestamp: row.timestamp || null, id: payload.turn_id || null, turn_id: payload.turn_id || null }];
  if (payload.type === 'function_call') return [{ type: 'tool_call', role: 'assistant', tool: payload.name || null, args: short(payload.arguments || '', 2000), call_id: payload.call_id || null, text: '', links: [], timestamp: row.timestamp || null, id: idOf(row, payload), turn_id: turnOf(row, payload) }];
  if (payload.type === 'function_call_output') return [{ type: 'tool_output', role: 'tool', tool: null, args: '', call_id: payload.call_id || null, text: short(payload.output || '', 2000), links: urls(payload.output || ''), timestamp: row.timestamp || null, id: idOf(row, payload), turn_id: turnOf(row, payload) }];
  return [];
}
function normalizeRow(row) { return normalizeRows(row)[0] || null; }
function countRawTools(row) {
  if (!row || typeof row !== 'object') return { tool_use: 0, tool_result: 0 };
  if (row.payload) {
    if (row.payload.type === 'function_call') return { tool_use: 1, tool_result: 0 };
    if (row.payload.type === 'function_call_output') return { tool_use: 0, tool_result: 1 };
    return { tool_use: 0, tool_result: 0 };
  }
  const content = row.message && row.message.content;
  const blocks = Array.isArray(content) ? content : [];
  return { tool_use: blocks.filter(function (b) { return b && b.type === 'tool_use'; }).length, tool_result: blocks.filter(function (b) { return b && b.type === 'tool_result'; }).length };
}
function normalizationAudit(raw, events) {
  const calls = events.filter(function (e) { return e.type === 'tool_call'; }).length;
  const outputs = events.filter(function (e) { return e.type === 'tool_output'; }).length;
  const errors = [];
  if (raw.tool_use > 0 && calls === 0) errors.push('SESSION_SHADOW_EMPTY');
  if (raw.tool_result > 0 && outputs === 0) errors.push('SESSION_SHADOW_EMPTY');
  if (raw.tool_use !== calls) errors.push('SESSION_SHADOW_PARTIAL');
  if (raw.tool_result !== outputs) errors.push('SESSION_SHADOW_PARTIAL');
  return { ok: errors.length === 0, raw: raw, normalized: { tool_call: calls, tool_output: outputs }, errors: Array.from(new Set(errors)) };
}
function addUnique(list, seen, text, source, reason) {
  const clean = short(text, 500);
  const key = clean.toLowerCase();
  if (!clean || seen.has(key)) return;
  seen.add(key);
  list.push({ id: 'rule-' + sha256(key).slice(0, 12), text: clean, source: source, reason: reason });
}
function detectSentences(text, regex) {
  return String(text || '').split(/[\n。；;]+/).map(function (item) { return item.trim(); }).filter(function (item) { return item && regex.test(item); });
}
function extractRules(events) {
  const collaboration = [], automation = [], hooks = [];
  const cSeen = new Set(), aSeen = new Set(), hSeen = new Set();
  for (const event of events) {
    if (event.type !== 'message' || event.role !== 'user') continue;
    for (const sentence of detectSentences(event.text, RULE_KEYS.collaboration)) addUnique(collaboration, cSeen, sentence, event.id, 'collaboration-contract');
    for (const sentence of detectSentences(event.text, RULE_KEYS.automation)) addUnique(automation, aSeen, sentence, event.id, 'automation-requirement');
    for (const sentence of detectSentences(event.text, RULE_KEYS.hook)) addUnique(hooks, hSeen, sentence, event.id, 'hook-requirement');
  }
  return { collaboration: collaboration, automation: automation, hooks: hooks };
}
function articleDecisions(events) {
  const byUrl = {};
  for (const event of events) {
    for (const url of event.links || []) {
      if (!byUrl[url]) byUrl[url] = { url: url, url_hash: sha256(url), seen_count: 0, first_seen: event.timestamp, last_seen: event.timestamp, messages: [] };
      const hit = byUrl[url]; hit.seen_count += 1; hit.last_seen = event.timestamp; hit.messages.push({ role: event.role, text: event.text, timestamp: event.timestamp, id: event.id });
    }
  }
  return Object.values(byUrl).map(function (item) {
    const combined = item.messages.map(function (m) { return m.text; }).join('\n');
    const assistantText = item.messages.filter(function (m) { return m.role === 'assistant'; }).map(function (m) { return m.text; }).join('\n');
    const userText = item.messages.filter(function (m) { return m.role === 'user'; }).map(function (m) { return m.text; }).join('\n');
    let decision = 'defer', reason = 'no explicit decision found';
    if (DECISION_RE.reject.test(assistantText)) { decision = 'reject'; reason = 'explicit reject/no-integrate decision'; }
    else if (DECISION_RE.absorb.test(assistantText)) { decision = 'absorb'; reason = 'explicit absorb/integrate decision'; }
    else if (DECISION_RE.defer.test(assistantText)) { decision = 'defer'; reason = 'explicit defer/backlog decision'; }
    const intent = /(融入|采纳|吸收|优化|学习|参考|integrate)/i.test(userText) ? 'integrate' : 'review';
    const target = SKILLS.find(function (name) { return combined.indexOf(name) !== -1; }) || null;
    const reopen = (combined.match(/当([^。；;\n]{1,60})时/) || [])[1] || null;
    return { url_hash: item.url_hash, url: item.url, seen_count: item.seen_count, first_seen: item.first_seen, last_seen: item.last_seen, intent: intent, decision: decision, reason: reason, decision_source: assistantText ? 'assistant_message' : 'none', target_skill_ref: target, verifier_ref: null, reopen_trigger: reopen };
  });
}
function matchVerifier(draft, verifierIds) {
  const text = [draft.title, draft.source_text, draft.url, draft.target_skill_ref].join(' ');
  const candidates = [];
  if (verifierIds.indexOf('local-transcript') !== -1 && /(skill|加载|触发|会话)/i.test(text)) candidates.push('local-transcript');
  if (verifierIds.indexOf('file-sha256-license') !== -1 && /(sha256|hash|字节|文件|artifact)/i.test(text)) candidates.push('file-sha256-license');
  if (verifierIds.indexOf('git-commit-exists') !== -1 && /(commit|git|版本)/i.test(text)) candidates.push('git-commit-exists');
  if (verifierIds.indexOf('doris-readonly') !== -1 && /(doris|sql|数仓|口径|表)/i.test(text)) candidates.push('doris-readonly');
  return candidates[0] || null;
}
function classifyDraft(draft, verifier) {
  if (draft.kind === 'article_decision' && (draft.decision === 'reject' || draft.decision === 'defer')) return 'not_a_case';
  if (!verifier) return 'verifier_missing';
  if (!draft.baseline && !draft.observed) return 'baseline_missing';
  return 'verified_candidate';
}
function caseDrafts(events, verifierIds) {
  const drafts = [];
  const decisions = articleDecisions(events);
  let index = 0;
  for (const decision of decisions) {
    const kind = 'article_decision';
    const draft = { id: 'case-' + sha256(kind + ':' + decision.url_hash).slice(0, 12), kind: kind, source_session_id: null, source_message_id: null, url_hash: decision.url_hash, title: (decision.target_skill_ref ? decision.target_skill_ref + ': ' : '') + 'article decision ' + decision.decision, expected_transition: 'UNKNOWN->VERIFIED', evidence_refs: ['url:' + decision.url_hash], decision: decision.decision, source_text: decision.url, target_skill_ref: decision.target_skill_ref, baseline: null, observed: null, verifier_ref: null };
    draft.verifier_ref = matchVerifier(draft, verifierIds);
    draft.classification = classifyDraft(draft, draft.verifier_ref);
    drafts.push(draft); index += 1;
  }
  for (const event of events) {
    if (event.type !== 'message' || event.role !== 'assistant') continue;
    if (!/(npm test|pytest|verify_all|PASS|passed|修复|已修|commit)/i.test(event.text)) continue;
    const baseline = (event.text.match(/(\d+)\s*(?:->|→|到|变成)\s*(\d+)/) || []).slice(0, 3);
    const draft = { id: 'case-' + sha256('real-change:' + String(event.id || index)).slice(0, 12), kind: 'real_change', source_session_id: null, source_message_id: event.id, url_hash: null, title: short(event.text, 120), expected_transition: baseline.length ? 'COUNT->0' : 'FAIL->PASS', evidence_refs: [event.id], decision: null, source_text: event.text, target_skill_ref: SKILLS.find(function (name) { return event.text.indexOf(name) !== -1; }) || null, baseline: baseline.length ? { before: Number(baseline[1]), after: Number(baseline[2]) } : null, observed: /PASS|passed|已修/.test(event.text) ? 'pass' : null, verifier_ref: null };
    draft.verifier_ref = matchVerifier(draft, verifierIds);
    draft.classification = classifyDraft(draft, draft.verifier_ref);
    drafts.push(draft); index += 1;
  }
  return drafts;
}
function shadowSession(events, options) {
  const opts = options || {};
  const verifierIds = opts.verifier_ids || [];
  const normalized = events.map(function (event) { return event; });
  const rules = extractRules(normalized);
  const decisions = articleDecisions(normalized);
  const drafts = caseDrafts(normalized, verifierIds);
  const userMessages = normalized.filter(function (e) { return e.type === 'message' && e.role === 'user'; });
  const assistantMessages = normalized.filter(function (e) { return e.type === 'message' && e.role === 'assistant'; });
  const toolCalls = normalized.filter(function (e) { return e.type === 'tool_call'; });
  const userTurns = normalized.filter(function (e) { return e.type === 'user_turn'; });
  const completions = normalized.filter(function (e) { return e.type === 'completion'; });
  const articleOccurrences = normalized.reduce(function (sum, e) { return sum + (e.links || []).length; }, 0);
  const uniqueArticleHashes = new Set(decisions.map(function (d) { return d.url_hash; }));
  const closeWithoutVerifier = drafts.filter(function (d) { return d.classification === 'verified_candidate' && !d.verifier_ref; }).length;
  const falseClose = drafts.filter(function (d) { return d.classification === 'verified_candidate' && (!d.verifier_ref || (!d.baseline && !d.observed)); }).length;
  const counts = { user_turns: userTurns.length, completions: completions.length, raw_user_messages: userMessages.length, raw_assistant_messages: assistantMessages.length, tool_calls: toolCalls.length, links: decisions.length, article_occurrences: articleOccurrences, duplicate_url_occurrence_count: articleOccurrences - uniqueArticleHashes.size };
  return {
    schema_version: 'autoarmory/session-shadow/v1',
    source_session_id: opts.session_id || null,
    counts: counts,
    rules: rules,
    article_decisions: decisions,
    case_drafts: drafts,
    verifier_bindings: drafts.map(function (d) { return { case_id: d.id, verifier_ref: d.verifier_ref, status: d.verifier_ref ? 'matched' : 'missing' }; }),
    unverifiable: drafts.filter(function (d) { return d.classification !== 'verified_candidate'; }).map(function (d) { return { case_id: d.id, classification: d.classification, reason: d.classification === 'verifier_missing' ? 'no registered verifier matched' : (d.classification === 'baseline_missing' ? 'no baseline/observed evidence' : 'not a verifiable case') }; }),
    summary: {
      verified_candidate: drafts.filter(function (d) { return d.classification === 'verified_candidate'; }).length,
      baseline_missing: drafts.filter(function (d) { return d.classification === 'baseline_missing'; }).length,
      verifier_missing: drafts.filter(function (d) { return d.classification === 'verifier_missing'; }).length,
      not_a_case: drafts.filter(function (d) { return d.classification === 'not_a_case'; }).length,
      article_decisions: decisions.length,
      auto_case_draft_count: drafts.length,
      close_without_verifier_count: closeWithoutVerifier,
      false_close_count: falseClose,
      reprocessed_article_count: decisions.length - uniqueArticleHashes.size
    }
  };
}
module.exports = { normalizeRow, normalizeRows, countRawTools, normalizationAudit, urls, normUrl, articleDecisions, shadowSession, matchVerifier };