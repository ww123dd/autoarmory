# Mechanism Admission Precheck and Outside-Funnel Review

The mechanism layer must not define the problem set.

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
  "outside_funnel_risk": "..."
}
```

`mechanism-precheck` rejects:

- missing severity;
- missing lowest-layer alternatives;
- no explanation of why the lower layer is insufficient;
- any missing jurisdiction condition;
- `not_now` proposals.

Rejected lower-layer proposals carry `route_to`, so they return to the lowest
layer instead of creating a mechanism.

## Outside-funnel review

Severe problems that the pipeline structurally cannot see are recorded in:

```text
outside-funnel-review.jsonl
```

Each finding carries severity, the problem, why the funnel missed it, the layer
that should solve it, and an evidence reference. This review records findings;
it does not auto-create mechanisms.
