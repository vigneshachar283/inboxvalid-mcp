// MX plausibility check.
//
// This one is NOT mocked - it's a real DNS MX lookup using Node's built-in
// `dns` module. It's cheap, requires no external service, and is a genuine
// signal (a domain with no MX records can't receive mail, full stop).
//
// Network calls fail in ways syntax checks don't: timeouts, resolver errors,
// transient DNS flakiness. The brief says "do not block on network errors -
// fail open gracefully," so a timeout or DNS error here returns `ok: true`
// with a `checked: false` flag rather than marking the email invalid -
// we never want a flaky resolver to reject a real user's signup.

import dns from "node:dns/promises";

// Pin known-public resolvers instead of trusting whatever the OS network
// stack hands us. The OS-configured resolver is environment-dependent -
// it can be unreachable behind certain VPNs, corporate networks, or
// misconfigured adapters (observed firsthand: ECONNREFUSED against the
// default Windows resolver during dev). Pinning trades a small amount of
// flexibility for a check that behaves the same in every environment it
// runs in, which matters more for a plausibility check like this one.
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const LOOKUP_TIMEOUT_MS = 2500;

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("mx_lookup_timeout")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function checkMx(domain) {
  try {
    const records = await withTimeout(dns.resolveMx(domain), LOOKUP_TIMEOUT_MS);
    const hasMx = Array.isArray(records) && records.length > 0;
    return {
      ok: hasMx,
      checked: true,
      reason: hasMx ? null : "no_mx_record",
    };
  } catch (err) {
    // ENOTFOUND / ENODATA => domain genuinely has no mail routing.
    // Anything else (timeout, ESERVFAIL, network down) is treated as
    // "couldn't verify" rather than "invalid" - fail open per the brief.
    if (err.code === "ENOTFOUND" || err.code === "ENODATA") {
      return { ok: false, checked: true, reason: "no_mx_record" };
    }
    return { ok: true, checked: false, reason: "mx_check_unavailable" };
  }
}
