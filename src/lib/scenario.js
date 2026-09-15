'use strict';

const fs = require('fs');
const path = require('path');
const { readJson } = require('./util');

function profilesDir() { return path.resolve(__dirname, '..', '..', 'examples', 'scenarios'); }
function listProfiles() { return fs.readdirSync(profilesDir()).filter(function (name) { return name.endsWith('.json'); }).map(function (name) { return readJson(path.join(profilesDir(), name)); }).sort(function (a, b) { return a.id.localeCompare(b.id); }); }
function getProfile(id) { const file = path.join(profilesDir(), id + '.json'); if (!fs.existsSync(file)) return null; return readJson(file); }
function plan(profile, capabilities) { const available = new Set(); for (const item of capabilities || []) for (const capability of item.capabilities || []) available.add(capability); const matched = profile.required_capabilities.filter(function (item) { return available.has(item); }); const missing = profile.required_capabilities.filter(function (item) { return !available.has(item); }); return { schema_version: 'autoarmory/scenario-plan/v1', profile: profile.id, required_capabilities: profile.required_capabilities, matched: matched, missing: missing, hard_gates: profile.hard_gates, ready: missing.length === 0, note: 'Planning only: AutoArmory routes and evaluates; it does not implement the scenario domain system.' }; }
module.exports = { listProfiles, getProfile, plan, profilesDir };
