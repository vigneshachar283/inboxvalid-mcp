import { checkSyntax } from "./checks/syntax.js";
import { checkDisposable } from "./checks/disposable.js";
import { checkMx } from "./checks/mx.js";

/**
 * @typedef {"valid" | "invalid" | "risky"} VerifyStatus
 *
 * @typedef {Object} VerifyResult
 * @property {string} email        - the input, echoed back
 * @property {VerifyStatus} status
 * @property {string} reason       - machine-readable reason code
 * @property {Object} checks       - per-check breakdown, for debuggability
 */

/**
 * Runs syntax -> disposable-domain -> MX checks in that order, short-
 * circuiting on the first hard failure so we never do a network call for
 * an address that's already syntactically invalid.
 *
 * Status mapping:
 *  - "invalid": syntax is broken, or the domain has no mail routing at all.
 *  - "risky":   syntactically valid but disposable, OR the MX check
 *               couldn't be completed (network failure) - we didn't clear
 *               it, so we don't call it "valid", but we also refuse to
 *               reject on our own infra flakiness.
 *  - "valid":   passed all three checks cleanly.
 *
 * @param {string} rawEmail
 * @returns {Promise<VerifyResult>}
 */
export async function verifyEmail(rawEmail, dependencies = {}) {
  // Dependency injection keeps the decision logic deterministic in unit tests
  // without requiring live DNS for every test case.
  const { checkDisposable: disposableCheck = checkDisposable, checkMx: mxCheck = checkMx } = dependencies;

  const syntax = checkSyntax(rawEmail);
  if (!syntax.ok) {
    return {
      email: rawEmail,
      status: "invalid",
      reason: syntax.reason,
      checks: { syntax, disposable: null, mx: null },
    };
  }

  const disposable = disposableCheck(syntax.domain);
  const mx = await mxCheck(syntax.domain);

  if (!mx.ok && mx.checked) {
    // Domain confirmed to have no mail routing - hard invalid,
    // regardless of the disposable-domain result.
    return {
      email: syntax.normalized,
      status: "invalid",
      reason: mx.reason,
      checks: { syntax, disposable, mx },
    };
  }

  if (!disposable.ok || !mx.checked) {
    // Disposable domain, or we couldn't confirm MX due to a network
    // hiccup - flag as risky rather than silently passing or hard-failing.
    return {
      email: syntax.normalized,
      status: "risky",
      reason: disposable.reason ?? mx.reason,
      checks: { syntax, disposable, mx },
    };
  }

  return {
    email: syntax.normalized,
    status: "valid",
    reason: "ok",
    checks: { syntax, disposable, mx },
  };
}
