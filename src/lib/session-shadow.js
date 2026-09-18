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
function asVerifiers(value) {
  return (Array.isArray(value) ? value : []).map(function (item) {
    if (typeof item === 'string') return { id: item, kind: null, assertion: null };
    return item || {};
  }).filter(function (item) { return item.id; });
}
function assertionOp(assertion) { return String(assertion && assertion.op || '').toLowerCase(); }
function assertionPath(assertion) { return String(assertion && assertion.path || '').toLowerCase(); }
function eq(assertion) { const op = assertionOp(assertion); return op === 'eq' || op === '===' || op === 'equals'; }
function transitionCompatible(expectedTransition, assertion) {
  if (!assertion || typeof assertion !== 'object') return false;
  const path = assertionPath(assertion);
  const value = assertion && assertion.value;
  const expected = String(expectedTransition || '').toUpperCase();
  if (expected === 'COUNT->0') return /(count|cnt|total|missing|errors?|failures?)/.test(path) && eq(assertion) && Number(value) === 0;
  if (expected === 'FAIL->PASS') return /(exit|status|code)/.test(path) && eq(assertion) && Number(value) === 0;
  const countTarget = expected.match(/^COUNT->(\d+)$/);
  if (countTarget) return /(count|cnt|total|missing|errors?|failures?)/.test(path) && eq(assertion) && Number(value) === Number(countTarget[1]);
  const countAtLeast = expected.match(/^COUNT->>= (\d+)$/) || expected.match(/^COUNT->>=(\d+)$/);
  if (countAtLeast) return /(count|cnt|total)/.test(path) && assertionOp(assertion) === 'gte' && Number(value) === Number(countAtLeast[1]);
  const countAtMost = expected.match(/^COUNT-><= (\d+)$/) || expected.match(/^COUNT-><=(\d+)$/);
  if (countAtMost) return /(count|cnt|total)/.test(path) && assertionOp(assertion) === 'lte' && Number(value) === Number(countAtMost[1]);
  return false;
}
function verifierTextMatches(text, verifier) {
  const identity = String(verifier.id || '') + ' ' + String(verifier.kind || '');
  if (/local-transcript/i.test(identity)) return /(skill|加载|触发|会话|transcript)/i.test(text);
  if (/file-sha256/i.test(identity)) return /(sha256|hash|字节|文件|artifact)/i.test(text);
  if (/git-commit/i.test(identity)) return /(commit|git|版本)/i.test(text);
  if (/doris/i.test(identity)) return /(doris|sql|数仓|口径|表)/i.test(text);
  if (/pid-file/i.test(identity)) return /(pid|进程|存活|服务器)/i.test(text);
  return false;
}
function verifierIdentityMentioned(text, verifier) {
  const body = String(text || '').toLowerCase();
  const id = String(verifier.id || '').toLowerCase();
  const kind = String(verifier.kind || '').toLowerCase();
  return (!!id && body.indexOf(id) !== -1) || (!!kind && body.indexOf(kind) !== -1);
}
function matchVerifier(draft, verifiers) {
  const text = [draft.title, draft.source_text, draft.url, draft.target_skill_ref].join(' ');
  const candidates = asVerifiers(verifiers).filter(function (verifier) { return verifierTextMatches(text, verifier); });
  for (const verifier of candidates) {
    if (verifierIdentityMentioned(text, verifier) && transitionCompatible(draft.expected_transition, verifier.assertion)) return { ref: verifier.id, status: 'matched', candidate: verifier.id };
  }
  if (candidates.length) return { ref: null, status: 'verifier_mismatch', candidate: candidates[0].id };
  return { ref: null, status: 'verifier_missing', candidate: null };
}
function classifyDraft(draft, match) {
  if (draft.kind === 'article_decision' && (draft.decision === 'reject' || draft.decision === 'defer')) return 'not_a_case';
  const resolved = typeof match === 'string' ? { ref: match, status: match ? 'matched' : 'verifier_missing' } : (match || { ref: null, status: 'verifier_missing' });
  if (resolved.status === 'verifier_mismatch') return 'verifier_mismatch';
  if (!resolved.ref || resolved.status !== 'matched') return 'verifier_missing';
  if (!draft.baseline && !draft.observed) return 'baseline_missing';
  return 'verified_candidate';
}
function expectedTransition(text, baseline) {
  if (baseline && baseline.length) return Number(baseline[2]) === 0 ? 'COUNT->0' : 'COUNT->' + Number(baseline[2]);
  const body = String(text || '');
  const atLeast = body.match(/(?:count|cnt|数量|次数|加载次数)[^\n]{0,40}?(?:>=|≥|at least|至少)\s*(\d+)/i);
  if (atLeast) return 'COUNT->>=' + Number(atLeast[1]);
  const atMost = body.match(/(?:count|cnt|数量|次数|加载次数)[^\n]{0,40}?(?:<=|≤|at most|至多)\s*(\d+)/i);
  if (atMost) return 'COUNT-><=' + Number(atMost[1]);
  return 'FAIL->PASS';
}
function caseDrafts(events, verifiers) {
  const drafts = [];
  const decisions = articleDecisions(events);
  let index = 0;
  for (const decision of decisions) {
    const kind = 'article_decision';
    const draft = { id: 'case-' + sha256(kind + ':' + decision.url_hash).slice(0, 12), kind: kind, source_session_id: null, source_message_id: null, url_hash: decision.url_hash, title: (decision.target_skill_ref ? decision.target_skill_ref + ': ' : '') + 'article decision ' + decision.decision, expected_transition: 'UNKNOWN->VERIFIED', evidence_refs: ['url:' + decision.url_hash], decision: decision.decision, source_text: decision.url, target_skill_ref: decision.target_skill_ref, baseline: null, observed: null, verifier_ref: null };
    const match = matchVerifier(draft, verifiers);
    draft.verifier_ref = match.ref;
    draft.verifier_candidate = match.candidate;
    draft.classification = classifyDraft(draft, match);
    drafts.push(draft); index += 1;
  }
  for (const event of events) {
    if (event.type !== 'message' || event.role !== 'assistant') continue;
    if (!/(npm test|pytest|verify_all|PASS|passed|修复|已修|commit)/i.test(event.text)) continue;
    const baseline = (event.text.match(/(\d+)\s*(?:->|→|到|变成)\s*(\d+)/) || []).slice(0, 3);
    const draft = { id: 'case-' + sha256('real-change:' + String(event.id || index)).slice(0, 12), kind: 'real_change', source_session_id: null, source_message_id: event.id, url_hash: null, title: short(event.text, 120), expected_transition: expectedTransition(event.text, baseline), evidence_refs: [event.id], decision: null, source_text: event.text, target_skill_ref: SKILLS.find(function (name) { return event.text.indexOf(name) !== -1; }) || null, baseline: baseline.length ? { before: Number(baseline[1]), after: Number(baseline[2]) } : null, observed: /PASS|passed|已修/.test(event.text) ? 'pass' : null, verifier_ref: null };
    const match = matchVerifier(draft, verifiers);
    draft.verifier_ref = match.ref;
    draft.verifier_candidate = match.candidate;
    draft.classification = classifyDraft(draft, match);
    drafts.push(draft); index += 1;
  }
  return drafts;
}
function shadowSession(events, options) {
  const opts = options || {};
  const verifiers = opts.verifiers || opts.verifier_ids || [];
  const normalized = events.map(function (event) { return event; });
  const rules = extractRules(normalized);
  const decisions = articleDecisions(normalized);
  const drafts = caseDrafts(normalized, verifiers);
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
    unverifiable: drafts.filter(function (d) { return d.classification !== 'verified_candidate'; }).map(function (d) { return { case_id: d.id, classification: d.classification, reason: d.classification === 'verifier_mismatch' ? 'verifier assertion cannot express expected_transition' : (d.classification === 'verifier_missing' ? 'no registered verifier matched' : (d.classification === 'baseline_missing' ? 'no baseline/observed evidence' : 'not a verifiable case')) }; }),
    summary: {
      verified_candidate: drafts.filter(function (d) { return d.classification === 'verified_candidate'; }).length,
      verifier_mismatch: drafts.filter(function (d) { return d.classification === 'verifier_mismatch'; }).length,
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
module.exports = { normalizeRow, normalizeRows, countRawTools, normalizationAudit, urls, normUrl, articleDecisions, shadowSession, matchVerifier, transitionCompatible };