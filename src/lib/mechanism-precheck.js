'use strict';
const LAYERS=['template','code_test','structural_gate','simple_linter','state_machine','mechanism'];
const SEVERITIES=['must_fix_now','backlog','not_now'];
const JURISDICTION=['external_fact_drifts','reusable','lifetime_accounting','enforcement_required'];
function result(status,ok,errors,extra){return Object.assign({schema_version:'autoarmory/mechanism-precheck/v1',status:status,ok:ok,errors:errors||[],layer_order:LAYERS},extra||{});}
function evaluate(proposal){
  const value=proposal||{};const errors=[];
  if(SEVERITIES.indexOf(value.severity)===-1)errors.push('severity_missing');
  if(!Array.isArray(value.lower_layer_options)||value.lower_layer_options.length===0)errors.push('lower_layer_options_missing');
  if(typeof value.outside_funnel_risk!=='string'||!value.outside_funnel_risk.trim())errors.push('outside_funnel_risk_missing');
  if(typeof value.owner!=='string'||!value.owner.trim())errors.push('owner_missing');
  if(typeof value.consumer!=='string'||!value.consumer.trim())errors.push('consumer_missing');
  const routeTo=(Array.isArray(value.lower_layer_options)&&value.lower_layer_options[0])||'template';
  if(errors.length)return result('rejected_missing',false,errors,{route_to:routeTo,owner:value.owner||null,consumer:value.consumer||null});
  if(value.severity==='not_now')return result('rejected_deferred',false,[],{route_to:'backlog',owner:value.owner,consumer:value.consumer});
  const jurisdiction=value.mechanism_jurisdiction||{};
  const missingJurisdiction=JURISDICTION.filter(function(key){return jurisdiction[key]!==true;});
  if(missingJurisdiction.length)return result('rejected_not_mechanism',false,['mechanism_jurisdiction_failed'],{missing_jurisdiction:missingJurisdiction,route_to:routeTo,jurisdiction:jurisdiction,owner:value.owner,consumer:value.consumer});
  if(typeof value.why_lower_layer_insufficient!=='string'||!value.why_lower_layer_insufficient.trim())return result('rejected_lower_layer',false,['why_lower_layer_insufficient_missing'],{route_to:routeTo,jurisdiction:jurisdiction,owner:value.owner,consumer:value.consumer});
  const enforcement=value.enforcement&&typeof value.enforcement==='object'?value.enforcement:{};
  if(enforcement.mode!=='block'||enforcement.coverage!=='complete')return result('advisory',false,['enforcement_incomplete'],{reason_code:'enforcement_incomplete',route_to:'mechanism',jurisdiction:jurisdiction,owner:value.owner,consumer:value.consumer,enforcement:enforcement});
  return result('accepted',true,[],{route_to:'mechanism',jurisdiction:jurisdiction,owner:value.owner,consumer:value.consumer,enforcement:enforcement});
}
module.exports={LAYERS,SEVERITIES,JURISDICTION,evaluate};
