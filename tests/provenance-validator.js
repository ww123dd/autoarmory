'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const validator = require('../src/lib/provenance-validator');
function must(condition, message) { if (!condition) throw new Error(message); }
const state = fs.mkdtempSync(path.join(os.tmpdir(), 'autoarmory-provenance-validator-'));
must(validator.classify('baseline.ref_unreadable: ENOENT') === 'unreadable_ref', 'unreadable ref category');
must(validator.classify('baseline.sha256_mismatch') === 'hash_mismatch', 'hash mismatch category');
must(validator.classify('commit_not_found:abc') === 'commit_missing', 'commit missing category');
must(validator.classify('pinned_verifier_not_registered') === 'pinned_verifier_missing', 'pinned verifier category');
const missing = validator.validate(state, { expected_provenance: 'baseline_manifest', baseline_id: 'nope' }, { repo: process.cwd() });
must(missing.ok === false && missing.categories.indexOf('unreadable_ref') !== -1, 'missing baseline manifest must classify as unreadable_ref');
console.log('provenance validator tests passed: invalid provenance categories are explicit');