# Team CLI -> AutoArmory

This is the caller-side contract for embedding AutoArmory routing into another CLI:

```bash
autoarmory serve --port 8787
AUTOARMORY_URL=http://127.0.0.1:8787 node integrations/team-cli/route.js request.json
```

The caller submits a routing request and consumes a canonical routing decision. It does not import AutoArmory internals.
