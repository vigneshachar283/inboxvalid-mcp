

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "tempmail.com",
  "10minutemail.com",
  "guerrillamail.com",
  "throwawaymail.com",
  "yopmail.com",
  "trashmail.com",
  "getnada.com",
  "sharklasers.com",
  "dispostable.com",
]);

export function checkDisposable(domain) {
  const isDisposable = DISPOSABLE_DOMAINS.has(domain.toLowerCase());
  return {
    ok: !isDisposable,
    reason: isDisposable ? "disposable_domain" : null,
  };
}
