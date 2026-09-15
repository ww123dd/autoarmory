# Adapter Contract

Adapters normalize external runner, evaluator, scanner, MCP gateway and observability artifacts into AutoArmory records.

## Required fields

```json
{
  "id": "vendor.adapter",
  "kind": "runner|evaluator|scanner|mcp-gateway|observability",
  "version": "1.0.0",
  "input": "description or schema ref",
  "output": ["capability", "incident", "outcome"],
  "permissions": { "read": true, "write": false, "network": false },
  "conformance": { "positive": "fixture", "negative": "fixture" },
  "budget": { "max_return_bytes": 32768 }
}
```

## Acceptance

1. positive fixture produces deterministic canonical output;
2. negative/malformed fixture is rejected;
3. no private transcript or credential is emitted;
4. return bytes are measured after serialization;
5. output can be replayed against the same adapter version.
