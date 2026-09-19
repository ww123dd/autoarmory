'use strict';
const checker=require('../src/lib/column-verify-checker');
const fs=require('fs'),os=require('os'),path=require('path'),{spawnSync}=require('child_process');
function must(condition,message){if(!condition)throw new Error(message);}
const positive=checker.evaluate({delivery_text:'SELECT etl_date, vasen_year FROM t;',has_verification:false,has_hedge:false});
must(positive.should_block===true,'unsupported column delivery without verification must block');
must(checker.evaluate({delivery_text:'SELECT etl_date FROM t;',has_verification:true,has_hedge:false}).should_block===false,'verification must allow');
must(checker.evaluate({delivery_text:'SELECT etl_date FROM t;',has_verification:false,has_hedge:true}).should_block===false,'honest hedge must allow');
must(checker.evaluate({delivery_text:'SELECT gs_ordernum FROM t;',has_verification:false,has_hedge:false}).should_block===false,'unrelated columns must allow');
must(checker.evaluate({delivery_text:'讨论 etl_date 的语义，不是 SQL 交付',has_verification:false,has_hedge:false}).should_block===false,'non-delivery prose must allow');
must(checker.evaluate({delivery_text:'SELECT sdate AS etl_date FROM t;',has_verification:false,has_hedge:false}).should_block===false,'alias definition must not block');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'column-verify-')); const vectors=path.join(temp,'vectors.jsonl');
fs.writeFileSync(vectors,[
 {id:'p1',delivery_text:'SELECT etl_date FROM t;',expect_should_block:true},
 {id:'p2',delivery_text:'SELECT vasen_year FROM t;',expect_should_block:true},
 {id:'n1',delivery_text:'SELECT etl_date FROM t;',has_verification:true,expect_should_block:false},
 {id:'n2',delivery_text:'SELECT gs_ordernum FROM t;',expect_should_block:false}
].map(r=>JSON.stringify(r)).join('\n')+'\n','utf8');
const hash=require('crypto').createHash('sha256').update(fs.readFileSync(vectors)).digest('hex');
const bridge=path.resolve(__dirname,'..','examples','adapters','column-verify','bridge.js');
const run=spawnSync(process.execPath,[bridge],{input:JSON.stringify({statement:JSON.stringify({kind:'column-verify',vectors_file:vectors,vectors_sha256:hash}),server:{readonly:true,name:'column-verify'}}),encoding:'utf8'});
must(run.status===0,'column verifier bridge must accept vectors'); const observed=JSON.parse(run.stdout).observed;
must(observed.passed===true&&observed.positive_passed===2&&observed.false_positive_count===0,'bridge must count positives and negatives deterministically');
const live=spawnSync(process.execPath,[bridge],{input:JSON.stringify({statement:JSON.stringify({kind:'column-verify',delivery_text:'SELECT etl_date FROM t;'}),server:{readonly:true,name:'column-verify'}}),encoding:'utf8'});
const liveObserved=JSON.parse(live.stdout).observed;
must(live.status===0&&liveObserved.should_block===true,'live bridge must re-derive one Stop event verdict');
const liveOk=spawnSync(process.execPath,[bridge],{input:JSON.stringify({statement:JSON.stringify({kind:'column-verify',delivery_text:'SELECT etl_date FROM t;',has_verification:true}),server:{readonly:true,name:'column-verify'}}),encoding:'utf8'});
must(JSON.parse(liveOk.stdout).observed.should_block===false,'live bridge must allow a verified delivery');
console.log('column verify checker tests passed: positive SQL blocks, verification/hedge/no-token/alias negatives allow, bridge vector replay');
