'use strict';
const inspector=require('../src/lib/change-inspector');
const audit=inspector.auditSignalClassifier();
function must(c,m){if(!c)throw new Error(m);}
must(audit.check_recall===1,'check positive recall must be 1');
must(audit.risk_recall===1,'risk positive recall must be 1');
must(audit.check_false_positive_rate===0,'check negative false positive rate must be 0');
must(audit.risk_false_positive_rate===0,'risk negative false positive rate must be 0');
must(audit.check_samples>=15&&audit.risk_samples>=15,'recall audit must have enough samples');
console.log('signal recall audit passed: check_risk recall=1, false_positive_rate=0');