'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sessionShadow = require('./session-shadow');

const DEFAULT_CHECK_PATTERN = 'pytest|npm test|node tests|verifier-preflight|chain-check|git status|sha256';
function fromStopEvent(event, options) {
  const opts = options || {};
  const input = event || {};
  const transcript = path.resolve(input.transcript_path || input.transcript || input.session_file || '');
  if (!transcript || !fs.existsSync(transcript)) throw new Error('Stop event transcript_path is required and must exist');
  const bytes = fs.readFileSync(transcript);
  const lines = bytes.toString('utf8').split(/\r?\n/);
  let boundaryLine = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].trim()) continue;
    let row;
    try { row = JSON.parse(lines[index]); } catch (_) { continue; }
    const events = sessionShadow.normalizeRows(row);
    if (events.some(function (item) { return item.type === 'message' && item.role === 'user'; })) boundaryLine = index;
  }
  if (boundaryLine < 0) throw new Error('Stop event transcript has no user turn boundary');
  const start = boundaryLine + 1;
  return {
    transcript: transcript,
    transcript_sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    boundary_line: boundaryLine,
    window: Math.max(0, lines.length - start),
    check_pattern: opts.checkPattern || DEFAULT_CHECK_PATTERN
  };
}
module.exports = { DEFAULT_CHECK_PATTERN, fromStopEvent };

