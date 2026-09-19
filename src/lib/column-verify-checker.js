'use strict';
const COLUMN_RE = /(etl_date|vasen_year)/i;
const ALIAS_RE = /(?:\bAS\s+)(etl_date|vasen_year)\b/gi;
const CHECK_RE = /(DESC|SHOW\s+COLUMNS|information_schema\.columns)/i;
const DELIVERY_RE = /(```\s*sql|(^|[^A-Za-z])SELECT\s|CREATE\s+TABLE|ALTER\s+TABLE|UPDATE\s|DELETE\s+FROM)/i;
const HEDGE_RE = /(待验证|未验证|待确认)/;
function evaluate(input) {
  const value = input || {};
  const text = String(value.delivery_text || value.text || value.input || '');
  const withoutAlias = text.replace(ALIAS_RE, 'AS __alias__');
  const has_delivery = DELIVERY_RE.test(text);
  const has_column_token = COLUMN_RE.test(withoutAlias);
  const has_verification = value.has_verification === true || CHECK_RE.test(text);
  const has_hedge = value.has_hedge === true || HEDGE_RE.test(text);
  return { has_delivery: has_delivery, has_column_token: has_column_token, has_verification: has_verification, has_hedge: has_hedge, should_block: has_delivery && has_column_token && !has_verification && !has_hedge };
}
function replay(vectors) {
  const rows = Array.isArray(vectors) ? vectors : [];
  let positiveCount = 0, positivePassed = 0, negativeCount = 0, negativePassed = 0, falsePositiveCount = 0;
  const failures = [];
  for (const row of rows) {
    const result = evaluate(row);
    const expected = row.expect_should_block === true;
    if (expected) { positiveCount += 1; if (result.should_block) positivePassed += 1; else failures.push({ id: row.id || null, expected: true, actual: result }); }
    else { negativeCount += 1; if (!result.should_block) negativePassed += 1; else { falsePositiveCount += 1; failures.push({ id: row.id || null, expected: false, actual: result }); } }
  }
  return { passed: failures.length === 0, positive_count: positiveCount, positive_passed: positivePassed, negative_count: negativeCount, negative_passed: negativePassed, false_positive_count: falsePositiveCount, failures: failures };
}
module.exports = { COLUMN_RE, ALIAS_RE, CHECK_RE, DELIVERY_RE, HEDGE_RE, evaluate, replay };
