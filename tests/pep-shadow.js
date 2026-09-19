'use strict';
const fs=require('fs');
const os=require('os');
const path=require('path');
const pep=require('../src/lib/pep-shadow');
function must(condition,message){if(!condition)throw new Error(message);}
function write(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,value,'utf8');}
function transcript(file,withCheck){const rows=[{type:'response_item',payload:{type:'message',role:'user',content:[{type:'input_text',text:'完成'}]}},{type:'response_item',payload:{type:'function_call',name:'exec_command',arguments:JSON.stringify({cmd:withCheck?'node tests/run.js':'Get-ChildItem'})}},{type:'response_item',payload:{type:'function_call_output',output:withCheck?'AutoArmory tests passed':'listing'}},{type:'response_item',payload:{type:'message',role:'assistant',content:[{type:'output_text',text:'完成'}]}}];write(file,rows.map(r=>JSON.stringify(r)).join('\n')+'\n');}
const root=fs.mkdtempSync(path.join(os.tmpdir(),'autoarmory-pep-shadow-'));
const state=path.join(root,'state');
write(path.join(state,'mechanisms.jsonl'),JSON.stringify({schema_version:'autoarmory/mechanism/v1',id:'mech-no-unverified-done',name:'No unverified completion',covered_failure_modes:['unverified_done'],trigger:'x',action:'x',verification:'x',verifier_id:'verification-gap',closure_criteria:'x',owner:'global',version:'1.0.0',scope:{project:'global',task_type:'completion-claim',environment:'codex-local',artifact_type:'stop-event'},enforcement:{point:'stop_hook',mode:'observe',coverage:'none'},status:'proposed'})+'\n'+JSON.stringify({schema_version:'autoarmory/mechanism/v1',id:'mech-retry-storm',verifier_id:'exec-retry-storm-checker',scope:{project:'global',artifact_type:'session-sequence'},enforcement:{point:'stop_hook',mode:'observe',coverage:'none'},status:'proposed'})+'\n','utf8');
const bad=path.join(root,'bad.jsonl');transcript(bad,false);
const good=path.join(root,'good.jsonl');transcript(good,true);
const repo=path.resolve(__dirname,'..');
let result=pep.run({session_id:'s1',turn_id:'t1',transcript_path:bad},{state:state,repo:repo});
must(result.ok===true && result.decisions.length===1 && result.decisions[0].decision==='would-block','missing check must produce would-block');
must(fs.existsSync(path.join(state,'pep-shadow.jsonl')),'PEP shadow must persist its decision');
result=pep.run({session_id:'s2',turn_id:'t2',transcript_path:good},{state:state,repo:repo});
must(result.decisions[0].decision==='would-allow','present check must produce would-allow');
must(!fs.existsSync(path.join(state,'hook-decisions.jsonl')),'shadow PEP must not write enforcement decisions');
console.log('PEP shadow tests passed: would-block/would-allow only, persisted, no enforcement side effect');
const cli = path.resolve(__dirname, '..', 'scripts', 'pep-shadow.js');
const eventFile = path.join(root, 'event.json');
write(eventFile, JSON.stringify({ session_id: 's3', turn_id: 't3', transcript_path: bad }) + '\n');
const cliRun = require('child_process').spawnSync(process.execPath, [cli, '--event', eventFile, '--state', state, '--repo', repo, '--json'], { encoding: 'utf8' });
must(cliRun.status === 0 && JSON.parse(cliRun.stdout).decisions[0].decision === 'would-block', 'PEP shadow CLI must report would-block and exit zero');
