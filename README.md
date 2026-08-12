# inboxvalid-mcp

An MCP server exposing a `verify_email` tool, built for the InboxValid.ai internship assignment (Task 2, Option A).

## What it does

The server exposes one MCP tool:

```text
verify_email(address)
```

It runs three checks in order and returns a structured result:

1. **Syntax** — pragmatic email-shape validation.
2. **Disposable domain** — checks the domain against a small mocked known-bad list.
3. **MX record** — performs a real DNS MX lookup to check mail-routing plausibility.

Checks short-circuit: an invalid address never triggers a network call.

### Tool contract

**Input**

```json
{
  "address": "user@example.com"
}
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

`status` is one of `valid`, `invalid`, or `risky`. `reason` is a machine-readable code for quick branching; `checks` contains the per-stage breakdown for logging/debugging.

## Architecture

```text
                MCP Client / Agent
                        |
                        | verify_email(address)
                        v
                  +-------------+
                  | MCP Server  |
                  +------+------+ 
                         |
                         v
                  +-------------+
                  | verifyEmail |
                  +------+------+ 
                         |
              +----------+----------+
              |          |          |
              v          v          v
           Syntax   Disposable      MX
              |          |          |
              |          |       DNS lookup
              +----------+----------+
                         |
                         v
                Structured result
```

The MCP layer is intentionally thin. Verification logic lives in separate modules, so the verification implementation can later be reused by another interface such as REST, a queue worker, or a batch tool.

## Why MCP instead of REST?

The assignment asks for a clean, well-typed tool interface that another system/agent can consume. MCP demonstrates that interface directly instead of only exposing a conventional HTTP route.

The same verification core is independent of MCP, so switching interfaces later would not require rewriting the validation logic.

## Why the checks are ordered this way

```text
Syntax
  |
  +-- invalid --> return immediately
  |
  v
Disposable domain
  |
  v
MX lookup
```

Syntax is local and cheap, so it runs first. This avoids a network call for obviously malformed input. The disposable check is also local. MX is the only network-bound step and therefore runs last.

## Validation semantics

### `invalid`

Used for definitive failures such as malformed syntax or a domain confirmed to have no MX records.

### `risky`

Used when the address deserves caution but the system does not have enough evidence to reject it. This includes disposable domains and an MX lookup that could not complete because of a transient network/resolver problem.

### `valid`

Used only when syntax, disposable-domain, and MX checks all pass.

## Error handling and fail-open behavior

A DNS timeout or non-definitive resolver failure is not treated as proof that the email is invalid. `checkMx` returns `checked: false`, and the overall result becomes `risky`.

A definitive `ENOTFOUND`/`ENODATA` result is treated as `no_mx_record` and therefore `invalid`.

The MCP tool itself has a final defensive catch. Unexpected internal failures are converted into a structured `risky` result with `reason: "internal_error"` so a caller receives an actionable result rather than an unhandled protocol failure.

## DNS resolver choice

The MX module uses Node's DNS resolver with public resolvers `8.8.8.8` and `1.1.1.1`. This avoids depending on a broken local resolver in environments where the OS-configured resolver is unreachable.

Trade-off: explicitly pinned public resolvers can be less suitable for corporate/VPN environments that rely on split-DNS or internal DNS.

## Why there is no SMTP mailbox probing

MX records show that a domain has mail routing; they do **not** prove that a specific mailbox exists.

SMTP/`RCPT TO` probing is deliberately outside this assignment because it is slower, can be blocked or rate-limited, and would introduce significantly more operational complexity. A production InboxValid backend could own deeper mailbox-level verification behind the same MCP tool contract.

## Retry and backoff

Retries are intentionally not implemented inside `verify_email`. The MX check has a 2.5 second timeout and is intended to remain suitable for a real-time caller.

For a production system, retry policy should depend on the caller: a signup flow has a tight latency budget, while a batch job can tolerate retries and backoff. That policy can live in a caller, worker, or queue instead of making the verification primitive slow for every use case.

## Testing

The project uses Node's built-in `node:test` runner, so no extra test framework is required.

```bash
npm test
```

The automated tests cover:

- valid and malformed syntax
- normalization
- empty/non-string input
- disposable domains
- normal domains
- short-circuiting before DNS
- valid results
- disposable/risky results
- definitive no-MX invalid results
- unavailable-MX fail-open behavior
- dependency injection used to keep verification tests deterministic

The MX dependency is injectable into `verifyEmail` for deterministic unit tests. This keeps tests independent of live DNS while the actual MCP demo still uses the real DNS implementation.

## MCP end-to-end demo

Run:

```bash
npm run demo
```

The demo starts the MCP server as a subprocess, connects with the SDK's `Client`, lists the available tools, and invokes `verify_email` with several inputs. This demonstrates the actual MCP client → server → tool flow over stdio rather than calling the verification function directly.

## Running the server

```bash
npm install
npm start
```

The server uses stdio because it is intended to be launched by an MCP client.

## Project structure

```text
inboxvalid-mcp/
├── src/
│   ├── server.js              # MCP server and verify_email tool contract
│   ├── verifyEmail.js         # verification orchestration
│   └── checks/
│       ├── syntax.js          # local syntax validation
│       ├── disposable.js      # mocked disposable-domain dataset
│       └── mx.js               # real DNS MX lookup
├── test/
│   ├── verifyEmail.test.js    # automated unit tests
│   ├── manualClient.js        # MCP end-to-end demo client
│   └── dnsDiagnostic.js       # development DNS diagnostic
├── package.json
└── README.md
```

## Trade-offs and production improvements

If this were moved beyond the assignment, I would:

- replace the hardcoded disposable-domain set with a maintained dataset/API;
- cache MX results by domain because MX records change relatively slowly;
- add a `bulk_verify_emails(addresses[])` tool for batch workloads;
- add rate limiting/concurrency controls around network-bound verification;
- add metrics for latency, DNS failures, and result distribution;
- add a deeper verification provider behind the same service interface if mailbox-level verification is required.

The current implementation intentionally keeps the scope small enough to be understood and explained end-to-end within the assignment's one-working-day constraint.

## Assumptions

- "MX-style plausibility" means confirming that the domain has mail routing, not proving that the individual mailbox exists.
- The disposable-domain data source is mocked, which is permitted by the assignment.
- MCP is implemented as the primary interface because Task 2 Option A asks for an MCP server exposing at least one verification tool.
