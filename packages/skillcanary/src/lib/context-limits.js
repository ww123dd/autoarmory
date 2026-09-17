'use strict';

// The only context limits AutoArmory treats as normative. They are the same limits the
// SkillCanary lint already enforced, so the budget ruler cannot invent a softer number.
const DESCRIPTION_MAX_CHARS = 1024;
const SKILL_MAX_LINES = 500;
const SKILL_MAX_BYTES = 12 * 1024;

module.exports = {
  DESCRIPTION_MAX_CHARS,
  SKILL_MAX_LINES,
  SKILL_MAX_BYTES
};