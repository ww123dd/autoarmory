# Negative Control Matrix

Step 0 runs one real chain and twelve negative mutations. It does not simulate a large benchmark.

```bash
npm run test:negative-controls
```

The controls are:

1. self-reported pass with a failing verifier
2. adapter tamper
3. bridge tamper
4. missing input hash
5. missing output hash
6. unregistered verifier
7. non-readonly verifier
8. missing approval
9. missing gate proof
10. missing counterexample
11. exit-code mismatch
12. external verifier-lock anchor tamper / write guard

Each control must produce one of:

```text
REJECT
MISMATCH
UNVERIFIABLE
BLOCK
```

The matrix reports:

- `tamper_detection_rate`
- `unverifiable_rate`
- `false_success_rate`
- `wrong_admission_rate`

`false_success_rate` is only meaningful after a deliberate forged-pass attempt. The first run records that attempt rather than assuming a denominator.