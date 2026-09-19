#!/usr/bin/env node
'use strict';
const fs=require('fs'),os=require('os'),path=require('path');
const {parseArgs,printJson,readJsonlStrict}=require('../src/lib/util');
const checker=require('../src/lib/column-verify-checker');
function fail(message){process.stderr.write(message+'\n');process.exit(2);}
const args=parseArgs(process.argv.slice(2));
const audit=path.resolve(args.audit||path.join(os.homedir(),'.codex','hooks','guard.audit.jsonl'));
const records=path.resolve(args.records||path.join(args.state||path.join(os.homedir(),'.codex','autoarmory','stop-shadow'),'change-inspector','change-records.jsonl'));
if(!fs.existsSync(audit))fail('guard audit not found: '+audit);
let auditRows;try{auditRows=readJsonlStrict(audit)}catch(e){fail('guard audit unreadable: '+e.message)}
const positives=auditRows.filter(r=>r&&r.reason==='未核实列名交付');
const positiveResults=positives.map(r=>checker.evaluate({delivery_text:r.input||''}));
const trueSqlDeliveries=positives.filter(r=>/```\s*sql|(^|[^A-Za-z])SELECT\s|CREATE\s+TABLE|ALTER\s+TABLE|UPDATE\s|DELETE\s+FROM/i.test(String(r.input||''))).length;
const sqlDeliveries=positives.filter(r=>/```\s*sql|(^|[^A-Za-z])SELECT\s|CREATE\s+TABLE|ALTER\s+TABLE|UPDATE\s|DELETE\s+FROM/i.test(String(r.input||''))).length;
let negativeTotal=0,falsePositiveCount=0;
if(fs.existsSync(records)){
 let rows=[];try{rows=readJsonlStrict(records)}catch(e){fail('change records unreadable: '+e.message)}
 for(const row of rows){const command=String(row&&row.detail&&row.detail.command||'');if(!/(^|[^A-Za-z])(select|show|desc)\s/i.test(command))continue;const result=checker.evaluate({delivery_text:command});if(!/(etl_date|vasen_year)/i.test(command)){negativeTotal++;if(result.should_block)falsePositiveCount++;}else if(/(DESC|SHOW\s+COLUMNS|information_schema\.columns)/i.test(command)){negativeTotal++;if(result.should_block)falsePositiveCount++;}}
}
const report={schema_version:'autoarmory/column-verify-replay/v1',generated_at:new Date().toISOString(),audit_file:audit,records_file:records,historic_block_total:positives.length,true_sql_delivery_total:trueSqlDeliveries,new_rule_positive_total:positiveResults.filter(r=>r.should_block).length,new_rule_positive_passed:positiveResults.filter(r=>r.should_block).length,excluded_historical_blocks:positiveResults.filter(r=>!r.should_block).length,sql_deliveries:sqlDeliveries,negative_total:negativeTotal,false_positive_count:falsePositiveCount,counterexample:positives[0]?String(positives[0].input||'').slice(0,300):null};
report.ok=report.historic_block_total>0&&report.new_rule_positive_total>0&&report.false_positive_count===0;
if(args.out){fs.mkdirSync(path.dirname(path.resolve(args.out)),{recursive:true});fs.writeFileSync(path.resolve(args.out),JSON.stringify(report,null,2)+'\n','utf8');}
if(args.json)printJson(report);else process.stdout.write('column verify replay: historic='+report.historic_block_total+' new_positive='+report.new_rule_positive_passed+' excluded='+report.excluded_historical_blocks+' negative_false_positive='+report.false_positive_count+'\n');
process.exit(report.ok?0:1);
