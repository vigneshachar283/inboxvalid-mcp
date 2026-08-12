// Disposable-domain check.
//
// MOCKED: in production this would be a maintained, frequently-updated list
// (e.g. a synced dataset like github.com/disposable-email-domains, or
// InboxValid's own proprietary feed) - not a hardcoded array. The list is
// isolated in its own module specifically so swapping the source (file ->
// database -> external API) later touches only this file, nothing else.

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
