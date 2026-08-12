import test from "node:test";
import assert from "node:assert/strict";
import { checkSyntax } from "../src/checks/syntax.js";
import { checkDisposable } from "../src/checks/disposable.js";
import { verifyEmail } from "../src/verifyEmail.js";

const mx = (result) => async () => result;

test("syntax: accepts and normalizes a valid address", () => {
  const result = checkSyntax("  User@Example.COM  ");
  assert.deepEqual(result, {
    ok: true,
    normalized: "user@example.com",
    domain: "example.com",
  });
});

test("syntax: rejects malformed, non-string, empty, and whitespace input", () => {
  assert.equal(checkSyntax("not-an-email").reason, "malformed_syntax");
  assert.equal(checkSyntax(123).reason, "not_a_string");
  assert.equal(checkSyntax("").reason, "empty");
  assert.equal(checkSyntax("some one@example.com").reason, "contains_whitespace");
});

test("disposable: flags a known disposable domain", () => {
  assert.deepEqual(checkDisposable("mailinator.com"), {
    ok: false,
    reason: "disposable_domain",
  });
});

test("disposable: allows a normal domain", () => {
  assert.deepEqual(checkDisposable("gmail.com"), {
    ok: true,
    reason: null,
  });
});

test("verifyEmail: invalid syntax short-circuits before DNS", async () => {
  let mxCalled = false;
  const result = await verifyEmail("not-an-email", {
    checkMx: async () => {
      mxCalled = true;
      return { ok: true, checked: true, reason: null };
    },
  });

  assert.equal(result.status, "invalid");
  assert.equal(result.reason, "malformed_syntax");
  assert.equal(mxCalled, false);
});

test("verifyEmail: valid address passes all checks", async () => {
  const result = await verifyEmail("User@Example.com", {
    checkMx: mx({ ok: true, checked: true, reason: null }),
  });

  assert.equal(result.status, "valid");
  assert.equal(result.reason, "ok");
  assert.equal(result.email, "user@example.com");
});

test("verifyEmail: disposable address becomes risky", async () => {
  const result = await verifyEmail("user@mailinator.com", {
    checkMx: mx({ ok: true, checked: true, reason: null }),
  });

  assert.equal(result.status, "risky");
  assert.equal(result.reason, "disposable_domain");
});

test("verifyEmail: no MX records are a definitive invalid result", async () => {
  const result = await verifyEmail("user@example.com", {
    checkMx: mx({ ok: false, checked: true, reason: "no_mx_record" }),
  });

  assert.equal(result.status, "invalid");
  assert.equal(result.reason, "no_mx_record");
});

test("verifyEmail: unavailable MX check fails open as risky", async () => {
  const result = await verifyEmail("user@example.com", {
    checkMx: mx({ ok: true, checked: false, reason: "mx_check_unavailable" }),
  });

  assert.equal(result.status, "risky");
  assert.equal(result.reason, "mx_check_unavailable");
});

test("verifyEmail: disposable result is evaluated before a successful MX result", async () => {
  let disposableDomain;
  const result = await verifyEmail("user@mailinator.com", {
    checkDisposable: (domain) => {
      disposableDomain = domain;
      return { ok: false, reason: "disposable_domain" };
    },
    checkMx: mx({ ok: true, checked: true, reason: null }),
  });

  assert.equal(disposableDomain, "mailinator.com");
  assert.equal(result.status, "risky");
});
