// Syntax check: a pragmatic (not fully RFC 5322) email format validator.
// Full RFC 5322 regex is famously unreadable and mostly overkill in practice -
// this covers the shape real-world addresses take, and rejects the common
// malformed cases (missing @, missing domain, spaces, no TLD).

const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export function checkSyntax(rawEmail) {
  if (typeof rawEmail !== "string") {
    return { ok: false, reason: "not_a_string" };
  }

  const email = rawEmail.trim();

  if (email.length === 0) {
    return { ok: false, reason: "empty" };
  }
  if (email.length > 254) {
    // RFC 5321 hard limit on total address length
    return { ok: false, reason: "too_long" };
  }
  if (/\s/.test(email)) {
    return { ok: false, reason: "contains_whitespace" };
  }
  if (!EMAIL_RE.test(email)) {
    return { ok: false, reason: "malformed_syntax" };
  }

  const [localPart, domain] = email.split("@");
  if (localPart.length > 64) {
    // RFC 5321 local-part limit
    return { ok: false, reason: "local_part_too_long" };
  }

  return { ok: true, normalized: email.toLowerCase(), domain: domain.toLowerCase() };
}
