'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const extractor = require('../src/lib/summon-extractor');
function must(condition, message) { if (!condition) throw new Error(message); }
(async function () {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-summon-'));
  const file = path.join(root, 'session.jsonl');
  fs.writeFileSync(file, [
    JSON.stringify({ type: 'response_item', timestamp: '2026-01-01T00:00:00Z', payload: { type: 'message', role: 'user', id: 'm1', content: [{ type: 'input_text', text: '用AutoArmory 去总结一下最近几轮出现的问题，优化一下vibe coding skill' }] } }),
    JSON.stringify({ type: 'response_item', timestamp: '2026-01-01T00:00:01Z', payload: { type: 'message', role: 'assistant', id: 'a1', content: [{ type: 'output_text', text: 'ignore' }] } }),
    JSON.stringify({ type: 'response_item', timestamp: '2026-01-01T00:00:02Z', payload: { type: 'message', role: 'user', id: 'm2', content: [{ type: 'input_text', text: 'AutoArmory 你直接判断要不要去做' }] } })
  ].join('\n') + '\n', 'utf8');
  const rows = await extractor.extractSession(file);
  must(rows.length === 2 && rows[0].target_skill === 'vibe-coding' && rows[0].requested_action === 'summarize_recent_problems', 'summon extractor must classify real user summons');
  must(rows[1].requested_action === 'judge_absorb' && rows[1].source_ref.indexOf('#L3') !== -1, 'summon extractor must preserve source line');
  console.log('summon extractor tests passed: AutoArmory summons classified and source-linked');
})();