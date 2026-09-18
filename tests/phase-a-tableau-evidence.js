'use strict';
const fs=require('fs');const path=require('path');function must(c,m){if(!c)throw new Error(m);}
const raw=fs.readFileSync(path.resolve(__dirname,'..','docs','evidence','phase-a-tableau-release-20260918.json'),'utf8');const r=JSON.parse(raw);
must(r.schema_version==='autoarmory/phase-a-evidence/v1','phase A evidence schema');
must(r.change_id==='change-tableau-release-zip-20260918'&&r.verifier==='tableau-release-zip','phase A decision identity');
must(r.artifact_sha256==='cb4a48d9a61944abc14f102bf34ab4babab3af146c841514c5cdf2638e855014','phase A artifact hash');
must(r.run.status==='closed'&&r.run.result==='pass'&&r.run.exit_code===0,'phase A run must close');
must(r.reuse_record===true&&r.no_fabricated_verifier===true&&r.llm_judge_calls===0,'phase A reuse boundary');
must(!/[A-Za-z]:[\\/]|\/Users\/|\/home\//.test(raw),'evidence must not contain machine paths');
console.log('phase A evidence passed: tableau release zip -> closed reuse record');
