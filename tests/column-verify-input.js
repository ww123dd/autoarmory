'use strict';
const fs=require('fs'),os=require('os'),path=require('path');
const input=require('../src/lib/column-verify-input');
function must(c,m){if(!c)throw new Error(m);}
function write(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,value,'utf8');}
function transcript(file,verified){const rows=[{type:'response_item',payload:{type:'message',role:'user',content:[{type:'input_text',text:'交付'}]}},{type:'response_item',payload:{type:'function_call',name:'exec_command',arguments:JSON.stringify({cmd:verified?'DESC t;':'Get-ChildItem'})}},{type:'response_item',payload:{type:'function_call_output',output:verified?'column exists':'listing'}}];write(file,rows.map(r=>JSON.stringify(r)).join('\n')+'\n');}
const root=fs.mkdtempSync(path.join(os.tmpdir(),'column-input-'));
const verified=path.join(root,'verified.jsonl');transcript(verified,true);
const live=input.fromStopEvent({session_id:'s1',turn_id:'t1',transcript_path:verified,last_assistant_message:'SELECT etl_date FROM t;'});
must(live.delivery_text==='SELECT etl_date FROM t;'&&live.has_verification===true&&live.has_hedge===false,'Stop input must carry delivery and verification facts');
const unchecked=path.join(root,'unchecked.jsonl');transcript(unchecked,false);
const gap=input.fromStopEvent({session_id:'s2',turn_id:'t2',transcript_path:unchecked,last_assistant_message:'SELECT etl_date FROM t;'});
must(gap.has_verification===false,'missing DESC/SHOW must leave verification false');
const hedged=input.fromStopEvent({session_id:'s3',turn_id:'t3',transcript_path:unchecked,last_assistant_message:'SELECT etl_date FROM t; 待验证'});
must(hedged.has_hedge===true,'hedge must be recognized from delivery text');
console.log('column verify input tests passed: Stop event -> delivery/verification/hedge facts');
