// MX plausibility check.

import dns from "node:dns/promises";


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
