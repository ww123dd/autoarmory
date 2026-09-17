'use strict';

// Structural trigger contract: a description has to declare both the positive
// activation surface and the nearest adjacent case it must not activate for.
// This is a static contract check, not a claim about behavioral quality.

const USE_MARKERS = [
  /【何时用】/,
  /when_to_use\s*[:=]/i,
  /use (?:this skill|it) when\b/i,
  /\buse when\b/i
];
const NOT_MARKERS = [
  /【何时不用】/,
  /when_not_to_use\s*[:=]/i,
  /不要用于/,
  /do not use (?:this skill |it )?(?:when|for)\b/i,
  /\bnot for\b/i
];

function clean(value) {
  return String(value || '').trim().replace(/^[：:;\s]+/, '').replace(/[。.\s]+$/, '');
}
function findMarker(text, markers) {
  let found = null;
  for (const regex of markers) {
    const match = regex.exec(text);
    if (!match) continue;
    if (!found || match.index < found.index) found = { index: match.index, end: match.index + match[0].length };
  }
  return found;
}
function parseTriggerContract(description) {
  const text = String(description || '').trim().replace(/^["']|["']$/g, '');
  const use = findMarker(text, USE_MARKERS);
  const not = findMarker(text, NOT_MARKERS);
  let whenToUse = text;
  let whenNotToUse = null;
  if (use && not && use.index < not.index) whenToUse = text.slice(use.end, not.index);
  else if (use) whenToUse = text.slice(use.end);
  else if (not && not.index > 0) whenToUse = text.slice(0, not.index);
  if (not) whenNotToUse = text.slice(not.end);
  return {
    when_to_use: clean(whenToUse) || null,
    when_not_to_use: clean(whenNotToUse) || null,
    has_when_to_use: !!use || !!(whenToUse && whenToUse.trim()),
    has_when_not_to_use: !!not
  };
}
function validateTriggerContract(description) {
  const parsed = parseTriggerContract(description);
  const errors = [];
  if (!String(description || '').trim()) errors.push('description is missing');
  if (!parsed.has_when_to_use || !parsed.when_to_use) errors.push('description must declare when_to_use');
  if (!parsed.has_when_not_to_use || !parsed.when_not_to_use) errors.push('description must declare when_not_to_use for the nearest adjacent case');
  if (parsed.when_not_to_use && parsed.when_not_to_use.length < 6) errors.push('description when_not_to_use is too short to be a boundary');
  return Object.assign({}, parsed, { ok: errors.length === 0, errors: errors });
}

module.exports = { parseTriggerContract, validateTriggerContract };