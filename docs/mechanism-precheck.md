# Mechanism Admission Precheck and Outside-Funnel Review

The mechanism layer must not define the problem set.

## Decision tree

```text
preference / process / judgment
-> template or skill

hard invariant
-> code + test + gate

external fact that drifts
-> mechanism + verifier + lifecycle

permission / ownership
-> owner / approval / policy

architecture debt / design error
-> direct repair

one-off issue
-> record or repair
```

## Step 0 fields

Every mechanism proposal must provide:

```json
{
  "severity": "must_fix_now",
  "lower_layer_options": ["template", "code_test", "structural_gate"],
  "why_lower_layer_insufficient": "...",
  "mechanism_jurisdiction": {
    "external_fact_drifts": true,
    "reusable": true,
    "lifetime_accounting": true,
    "enforcement_required": true
  },
  "owner": "owner-id",
  "consumer": "consumer-id",
  "enforcement": {
    "mode": "block",
    "coverage": "complete"
  },
  "outside_funnel_risk": "..."
}
```

`mechanism-precheck` rejects:

- missing severity, owner, consumer, lowest-layer alternatives, or outside-funnel risk;
- no explanation of why the lower layer is insufficient;
- any missing jurisdiction condition;
- `not_now` proposals.

If enforcement is missing or incomplete, the proposal is `advisory`, not
`candidate`. `active` requires a real entry, verifier, scope, expiry, reopen,
owner, and consumer.

## Outside-funnel review

Severe problems that the pipeline structurally cannot see are recorded in:

```text
outside-funnel-review.jsonl
```

Each finding carries severity, the problem, why the funnel missed it, the layer
that should solve it, and an evidence reference. This review records findings;
it does not auto-create mechanisms.
