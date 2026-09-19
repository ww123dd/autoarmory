'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const sediment = require('../src/lib/sediment-extractor');
function must(condition, message) { if (!condition) throw new Error(message); }
(async function () {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-sediment-'));
  const file = path.join(root, 'session.jsonl');
  fs.writeFileSync(file, [
    JSON.stringify({ type: 'response_item', timestamp: '2026-01-01T00:00:00Z', payload: { type: 'message', role: 'user', id: 'm1', content: [{ type: 'input_text', text: '用AutoArmory 总结问题，优化vibe coding skill' }] } }),
    JSON.stringify({ type: 'response_item', timestamp: '2026-01-01T00:00:01Z', payload: { type: 'message', role: 'assistant', id: 'a1', content: [{ type: 'output_text', text: '吸收：把验证缺口落地为机制清单。运行 verification-gap 检查。' }] } })
  ].join('\n') + '\n', 'utf8');
  const rows = await sediment.extractSession(file, [{ summon_id: 's1', source_ref: file + '#L1', user_instruction: '用AutoArmory 总结问题，优化vibe coding skill', target_skill: 'vibe-coding' }]);
  must(rows.length === 1 && rows[0].decision === 'absorb' && rows[0].verification_run.indexOf('verification-gap') !== -1, 'sediment extractor must capture absorb decision and verification run');
  console.log('sediment extractor tests passed: summon -> absorb/reject/defer candidate with evidence');
})();