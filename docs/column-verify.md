# 数仓列名交付核实

The rule is owned by skill `数仓开发`, not by an inline Stop-hook regex.

## Current replay facts

```text
historic block total       73
true SQL delivery total    60
new-rule true positives    44
excluded historical blocks 29
SQL negative samples       4161
false positives             0
```

The 29 exclusions are not ignored: they split into 16 alias-only SQL
definitions (`sdate AS etl_date`) and 13 non-delivery discussion blocks. The
new checker deliberately allows those instead of preserving the old
false-positive behavior.

## Verifier

`shuzang-column-verify-checker` evaluates three deterministic facts:

- delivery text has an SQL delivery shape;
- delivery text uses `etl_date` / `vasen_year` outside an alias definition;
- the session has mechanical verification (`DESC`, `SHOW COLUMNS`,
  `information_schema.columns`) or an explicit hedge (`待验证` / `未验证` / `待确认`).

The mechanism remains `observe` until shadow comparison is clean and the
hardcoded stopGuard regex is removed in a single-source switch.
