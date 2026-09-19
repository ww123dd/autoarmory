'use strict';
const precheck=require('../src/lib/mechanism-precheck');
function must(c,m){if(!c)throw new Error(m);}
const base={severity:'must_fix_now',lower_layer_options:['template','code_test','structural_gate','simple_linter'],why_lower_layer_insufficient:'外部事实会漂移，模板和单测无法在每次提交前复算；需要跨 case 复用并终身记账。',mechanism_jurisdiction:{external_fact_drifts:true,reusable:true,lifetime_accounting:true,enforcement_required:true},outside_funnel_risk:'高信号策略可能长期看不见持续漂移'};
const accepted=precheck.evaluate(base);
must(accepted.status==='accepted'&&accepted.ok===true,'complete mechanism precheck must accept');
const missing=precheck.evaluate(Object.assign({},base,{severity:undefined}));
must(missing.status==='rejected_missing'&&missing.errors.includes('severity_missing'),'missing severity must reject');
const lower=precheck.evaluate(Object.assign({},base,{why_lower_layer_insufficient:''}));
must(lower.status==='rejected_lower_layer'&&lower.route_to==='template','missing low-layer insufficiency must reject');
const notMech=precheck.evaluate(Object.assign({},base,{mechanism_jurisdiction:{external_fact_drifts:true,reusable:false,lifetime_accounting:false,enforcement_required:true}}));
must(notMech.status==='rejected_not_mechanism'&&notMech.route_to==='template','out-of-jurisdiction must route to a lower layer');
const deferred=precheck.evaluate(Object.assign({},base,{severity:'not_now'}));
must(deferred.status==='rejected_deferred','not_now must not become a mechanism candidate');
console.log('mechanism precheck tests passed: severity, lowest layer, insufficiency, jurisdiction, defer');
