'use strict';
const fs=require('fs');const path=require('path');function must(c,m){if(!c)throw new Error(m);}
const raw=fs.readFileSync(path.resolve(__dirname,'..','docs','evidence','repeat-starvation-20260918.json'),'utf8');const r=JSON.parse(raw);
must(r.schema_version==='autoarmory/repeat-starvation-evidence/v1','repeat starvation evidence schema');
must(r.risk_signal_count===3138&&r.risk_without_check_gap_count===3138&&r.groups_with_risk_and_check_gap===0,'risk starvation numbers');
must(r.repeat_max_count===15,'repeat max count must use detail.count');
must(r.structured_result_ratio===0.0014,'structured result ratio');
must(r.high_signal_count_without_dedupe===68&&r.high_signal_count_with_dedupe===24&&r.repeat_threshold_suppressed_count===44,'repeat threshold dedupe must reduce 68 to 24');
must(r.llm_judge_calls===0&&r.synthetic_record_count===0&&r.private_session_content_shipped===false,'starvation audit boundary');
must(!/[A-Za-z]:[\\/]|\/Users\/|\/home\//.test(raw),'evidence must not contain machine paths');
console.log('repeat starvation evidence passed: repeat max=15, high signal 68 -> 24 after threshold dedupe');
