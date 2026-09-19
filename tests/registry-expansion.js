'use strict';
const verify = require('../src/lib/verify');
function must(condition, message) { if (!condition) throw new Error(message); }
const repo = require('path').resolve(__dirname, '..');
const enumeration = verify.captureRefs([{ id: 'enumeration-check', verifier: 'enumeration-completeness', params: {} }], { repo: repo, trials: 1 });
must(enumeration.status === 'captured', 'enumeration-completeness must capture: ' + JSON.stringify(enumeration));
const enumObserved = enumeration.refs[0].fresh.observed;
must(enumObserved.missing_count === 0 && enumObserved.truncated === false && enumObserved.complete === true, 'enumeration-completeness must be complete');
must(enumObserved.files_scanned >= enumObserved.candidate_count && enumObserved.candidate_count > 0, 'enumeration-completeness must report scanned/candidate counts');

const gap = verify.captureRefs([{ id: 'verification-gap-check', verifier: 'verification-gap', params: {} }], { repo: repo, trials: 1 });
must(gap.status === 'captured', 'verification-gap must capture: ' + JSON.stringify(gap));
const gapObserved = gap.refs[0].fresh.observed;
must(gapObserved.independent_check_count >= 1 && gapObserved.verification_gap_count === 0 && gapObserved.complete === true, 'verification-gap must find an independent check in the pinned window');
must(/^[a-f0-9]{64}$/.test(gapObserved.transcript_sha256), 'verification-gap must report the pinned transcript digest');
console.log('registry expansion tests passed: enumeration-completeness + verification-gap reproduce their pinned facts');