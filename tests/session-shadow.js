'use strict';
const { shadowSession } = require('../src/lib/session-shadow');
const { must } = require('assert');
function ok(c,m){ if(!c) throw new Error(m); }
const events = [
  { type:'message', role:'user', id:'u1', text:'必须直接去做，不要让我再手工建 case；外部 verifier 才是信任根。', links:[], timestamp:'2026-01-01T00:00:00Z' },
  { type:'message', role:'assistant', id:'a1', text:'已把这篇文章融入 元技能优化 skill，并跑了 local-transcript verifier。 https://example.com/article?utm_source=x', links:['https://example.com/article'], timestamp:'2026-01-01T00:00:01Z' },
  { type:'message', role:'assistant', id:'a2', text:'这篇文章不融入，原因是没有 real consumer。 https://example.com/reject', links:['https://example.com/reject'], timestamp:'2026-01-01T00:00:02Z' },
  { type:'message', role:'user', id:'u2', text:'这里再引用一次 https://example.com/article?utm_source=y', links:['https://example.com/article'], timestamp:'2026-01-01T00:00:03Z' },
  { type:'user_turn', role:'user', id:'turn-u', text:'必须直接去做', links:[], timestamp:'2026-01-01T00:00:04Z' },
  { type:'completion', role:'assistant', id:'turn-a', text:'done', links:[], timestamp:'2026-01-01T00:00:05Z' }
];
const report = shadowSession(events, { session_id:'fixture', verifier_ids:['local-transcript'] });
ok(report.counts.user_turns === 1 && report.counts.raw_user_messages === 2 && report.counts.completions === 1, 'user/completion event counts');
ok(report.rules.collaboration.length > 0 && report.rules.automation.length > 0, 'rules extracted');
ok(report.article_decisions.length === 2, 'urls deduplicated');
const article = report.article_decisions.find(function (x) { return x.url.indexOf('example.com/article') !== -1; });
ok(article.seen_count === 2, 'duplicate url increments seen_count without reprocessing');
ok(article.decision === 'absorb' && article.target_skill_ref === '元技能优化', 'decision and skill extracted');
ok(report.summary.auto_case_draft_count > 0 && report.summary.close_without_verifier_count === 0, 'drafts are created without unverified closure');
ok(report.unverifiable.length > 0, 'unverifiable items are explicit');
console.log('session shadow tests passed: rules, dedup, decisions, drafts, verifier binding, no unverified close');