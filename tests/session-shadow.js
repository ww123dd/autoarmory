'use strict';
const { shadowSession, matchVerifier, transitionCompatible } = require('../src/lib/session-shadow');
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
ok(transitionCompatible('COUNT->0', { path: 'cnt', op: 'eq', value: 0 }) === true, 'count-to-zero assertion matches');
ok(transitionCompatible('FAIL->PASS', { path: 'exit_code', op: 'eq', value: 0 }) === true, 'fail-to-pass assertion matches');
ok(transitionCompatible('FAIL->PASS', { path: 'match', op: 'eq', value: true }) === false, 'file match cannot express fail-to-pass');
ok(transitionCompatible('COUNT->12', { path: 'cnt', op: 'eq', value: 12 }) === true, 'count-to-n matches its own target');
ok(transitionCompatible('COUNT->12', { path: 'cnt', op: 'eq', value: 0 }) === false, 'count-to-n does not match zero');
ok(transitionCompatible('COUNT->>=3', { path: 'count', op: 'gte', value: 3 }) === true, 'count threshold matches gte');
ok(transitionCompatible('COUNT->>=3', { path: 'count', op: 'eq', value: 3 }) === false, 'count threshold rejects equality');
const thresholdMatch = matchVerifier({ title: 'meta-skill-load-count', source_text: 'meta-skill-load-count count must be at least 3', expected_transition: 'COUNT->>=3' }, [{ id: 'meta-skill-load-count', kind: 'local-transcript-readonly', assertion: { path: 'count', op: 'gte', value: 3 } }]);
ok(thresholdMatch.ref === 'meta-skill-load-count' && thresholdMatch.status === 'matched', 'real history verifier expresses COUNT->>=3');
const mismatch = matchVerifier({ title: 'file sha256 evidence', source_text: 'sha256 file', expected_transition: 'FAIL->PASS' }, [{ id: 'file-sha256-license', assertion: { path: 'match', op: 'eq', value: true } }]);
ok(mismatch.ref === null && mismatch.status === 'verifier_mismatch' && mismatch.candidate === 'file-sha256-license', 'wrong verifier is a mismatch, not a binding');
const countMatch = matchVerifier({ title: 'doris count', source_text: 'doris-readonly-count returns cnt to zero', expected_transition: 'COUNT->0' }, [{ id: 'doris-readonly-count', assertion: { path: 'cnt', op: 'eq', value: 0 } }]);
ok(countMatch.ref === 'doris-readonly-count' && countMatch.status === 'matched', 'count assertion binds to count-to-zero');
const looseCategory = matchVerifier({ title: 'doris count', source_text: 'doris count must return to zero', expected_transition: 'COUNT->0' }, [{ id: 'doris-readonly-count', assertion: { path: 'cnt', op: 'eq', value: 0 } }]);
ok(looseCategory.ref === null && looseCategory.status === 'verifier_mismatch', 'category mention without verifier identity is a mismatch');
const mismatchReport = shadowSession([{ type:'message', role:'assistant', id:'m1', text:'已修复并记录 sha256 文件证据，FAIL->PASS。', links:[], timestamp:'2026-01-01T00:00:00Z' }], { session_id:'mismatch-fixture', verifiers:[{ id:'file-sha256-license', assertion:{ path:'match', op:'eq', value:true } }] });
ok(mismatchReport.summary.verifier_mismatch >= 1, 'mismatch count is reported');
ok(!mismatchReport.case_drafts.some(function (d) { return d.classification === 'verified_candidate'; }), 'wrong verifier must not remain verified_candidate');
console.log('session shadow tests passed: rules, dedup, decisions, drafts, verifier transition matching, no unverified close');