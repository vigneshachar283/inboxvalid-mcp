# inboxvalid-mcp

An MCP server exposing a `verify_email` tool, built for the InboxValid.ai
internship assignment (Task 2, Option A).

## What it does

Exposes one MCP tool, `verify_email(address)`, that runs three checks in
order and returns a structured result:

1. **Syntax** — pragmatic email-shape validation (not full RFC 5322, which
   is mostly academic in practice).
2. **Disposable domain** — checks the domain against a small mocked
   known-bad list.
3. **MX record** — a real DNS MX lookup confirming mail-routing
   plausibility (not mocked).

Checks run in this order because syntax and disposable-domain checks are
local and free, while MX is the only network-bound step — so a
malformed address never triggers a DNS call at all.

### Tool contract

**Input**
```json
{ "address": "user@example.com" }
```

**Output**
```json
{
  "email": "user@example.com",
  "status": "valid",
  "reason": "ok",
  "checks": {
    "syntax": { "ok": true, "normalized": "user@example.com", "domain": "example.com" },
    "disposable": { "ok": true, "reason": null },
    "mx": { "ok": true, "checked": true, "reason": null }
  }
}
```

`status` is one of `valid`, `invalid`, or `risky`. `reason` is a
machine-readable code for quick branching; `checks` gives the per-stage
breakdown for logging/debugging.

## Why MCP instead of REST

The assignment asks for a clean, well-typed tool interface another
system/agent can consume — that's what MCP demonstrates directly, rather
than a conventional HTTP route. Verification logic lives in its own
modules independent of MCP, so a REST wrapper could be added later
without touching the validation code.

## Validation semantics

- **`invalid`** — definitive failures: malformed syntax, or a domain
  confirmed (via `ENOTFOUND`/`ENODATA`) to have no MX records at all.
- **`risky`** — the address deserves caution but there isn't enough
  evidence to reject it outright. Covers disposable domains, and an MX
  lookup that couldn't complete due to a transient DNS/network problem.
- **`valid`** — syntax, disposable-domain, and MX checks all passed.

## Error handling and fail-open behavior

A DNS timeout or non-definitive resolver error is not treated as proof
an email is invalid — `checkMx` returns `checked: false` and the result
becomes `risky`, not `invalid`. Only a confirmed no-MX-records result is
treated as definitively `invalid`.

The MX module also pins explicit public resolvers (`8.8.8.8`, `1.1.1.1`)
rather than trusting the OS-configured resolver — see **Challenges**
below for why. Trade-off: this can be less suitable for corporate/VPN
setups relying on internal or split DNS.

The MCP tool itself has a final defensive catch: any unexpected internal
failure is converted into a structured `risky` result with
`reason: "internal_error"`, so a caller always gets an actionable result
instead of an unhandled protocol error.

No SMTP/`RCPT TO` mailbox probing is attempted — MX records prove a
domain *can* route mail, not that a specific mailbox exists. Real
mailbox-level verification is slower, often blocked or rate-limited by
receiving servers, and is exactly the layer a production InboxValid
backend would own behind this same tool contract.

**Retry/backoff** is intentionally not built into `verify_email` — the
MX check has a 2.5s timeout suitable for a real-time caller, and
retrying inline would just add latency. In production, retry policy
belongs to the caller (a signup form wants a fast fail; a batch job can
tolerate retries), not the verification primitive.

## Testing

```bash
npm install
npm test          # automated unit tests (node:test) — no live DNS needed
npm run demo       # MCP end-to-end demo: spawns the server, connects a
                   # real MCP client, lists tools, calls verify_email
npm start          # runs the server standalone (stdio, for an MCP client)
```

Unit tests use dependency injection — `verifyEmail(email, { checkMx, checkDisposable })`
accepts overrides — so DNS behavior (valid, no-MX, timeout, disposable)
can be tested deterministically without a network call. `npm run demo`
is separate and intentionally *does* use live DNS, since it's meant to
prove the real MCP client → server → tool flow works end to end.

## Project structure

```text
inboxvalid-mcp/
├── src/
│   ├── server.js              # MCP server + verify_email tool contract
│   ├── verifyEmail.js         # orchestration (syntax → disposable → MX)
│   └── checks/
│       ├── syntax.js          # local syntax validation
│       ├── disposable.js      # mocked disposable-domain list
│       └── mx.js              # real DNS MX lookup
├── test/
│   ├── verifyEmail.test.js    # automated unit tests
│   ├── manualClient.js        # MCP end-to-end demo client
│   └── dnsDiagnostic.js       # standalone DNS troubleshooting script
├── package.json
└── README.md
```

## Challenges faced

- **OS DNS resolver was unreachable during development.** Early testing
  on Windows returned `ECONNREFUSED` for every MX lookup — not because
  the target domains were down, but because Node's `dns` module
  couldn't reach the resolver the OS network stack was configured to
  use. Wrote `test/dnsDiagnostic.js` as a minimal standalone script to
  isolate the DNS layer from the rest of the tool and confirm the
  failure wasn't in my logic. Fixed by pinning explicit public
  resolvers (`8.8.8.8`, `1.1.1.1`) instead of trusting the OS-provided
  one — this also turned into the real justification for the fail-open
  design, since it's a genuine failure mode, not a hypothetical one.
- **Testing a network-dependent function deterministically.** The
  original version of `verifyEmail` called `checkMx` directly, so the
  only way to test it was a live DNS call — slow, and non-deterministic
  in CI or on a flaky connection. Solved with lightweight dependency
  injection: `verifyEmail` accepts optional overrides for `checkMx` and
  `checkDisposable`, defaulting to the real implementations. Unit tests
  inject fake responses (timeout, no-MX, disposable) to cover every
  branch instantly and reproducibly, while `npm run demo` still uses the
  real DNS path to prove the actual behavior end to end.
- **Deciding what "risky" should mean.** A binary valid/invalid loses
  information: a disposable-domain address and a DNS-timeout address are
  both uncertain, but for different reasons, and a caller might want to
  treat them differently. Settled on a shared `risky` status with a
  distinguishing `reason` code rather than adding more status values,
  to keep the contract simple while still preserving that distinction.

## What I'd do next with more time

- Replace the hardcoded disposable-domain set with a maintained,
  synced dataset — the module is isolated specifically so this is a
  one-file change.
- Cache MX results by domain (they change slowly) to cut lookup latency
  on repeat checks.
- Add a `bulk_verify_emails(addresses[])` tool for batch workloads.
- Add rate limiting/concurrency controls around the network-bound step.

## Assumptions

- "MX-style plausibility" means confirming the domain has mail routing,
  not proving a specific mailbox exists.
- Disposable-domain data source is mocked, per the brief's explicit
  allowance.
