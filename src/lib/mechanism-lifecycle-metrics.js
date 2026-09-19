'use strict';
const fs = require('fs');
const path = require('path');
const { readJsonl } = require('./util');
function rows(file) { return fs.existsSync(file) ? readJsonl(file) : []; }
function latest(values) {
  return values.filter(Boolean).sort(function (a, b) { return Date.parse(a) - Date.parse(b); }).pop() || null;
}
function read(stateDir, mechanismId) {
  const runs = rows(path.join(stateDir, 'mechanism-runs.jsonl')).filter(function (item) { return item.mechanism_id === mechanismId; });
  const closures = rows(path.join(stateDir, 'closures.jsonl')).filter(function (item) { return item.mechanism_id === mechanismId; });
  const outcomes = rows(path.join(stateDir, 'outcome-records.jsonl')).filter(function (item) { return item.mechanism_id === mechanismId; });
  const lifecycle = rows(path.join(stateDir, 'lifecycle.jsonl')).filter(function (item) { return item.mechanism_id === mechanismId; });
  const latestLifecycle = lifecycle.slice().sort(function (a, b) { return Date.parse(a.at || 0) - Date.parse(b.at || 0); }).pop() || null;
  const times = runs.map(function (item) { return item.finished_at || item.recorded_at; })
    .concat(closures.map(function (item) { return item.closed_at; }))
    .concat(outcomes.map(function (item) { return item.observed_at; }))
    .concat(lifecycle.map(function (item) { return item.at; }));
  return {
    schema_version: 'autoarmory/mechanism-lifecycle-metrics/v1',
    mechanism_id: mechanismId,
    reuse_count: runs.length,
    success_count: closures.length,
    overturn_count: outcomes.filter(function (item) { return item.type === 'overturned'; }).length,
    reopen_count: outcomes.filter(function (item) { return item.type === 'reopened'; }).length,
    lifecycle_state: latestLifecycle ? latestLifecycle.to : 'candidate',
    last_event_at: latest(times)
  };
}
module.exports = { read };
