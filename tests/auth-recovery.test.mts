import assert from "node:assert/strict";
import test from "node:test";

import { getGoogleProviderConfig, isGoogleAuthConfigured } from "../lib/auth-provider-config.ts";
import { getSafeLocalRedirect } from "../lib/auth-redirect.ts";
import { createPasswordResetEmailContent } from "../lib/auth-recovery-content.ts";

test("password reset email contains the one-time reset URL and expiry guidance", () => {
  const content = createPasswordResetEmailContent({
    displayName: "Shannon",
    resetUrl: "https://app.slpcc63.com/api/auth/reset-password/token?callbackURL=%2Freset-password"
  });

  assert.match(content.subject, /reset/i);
  assert.match(content.text, /expires in one hour/i);
  assert.match(content.text, /can only be used once/i);
  assert.match(content.text, /https:\/\/app\.slpcc63\.com/);
});

test("password reset email escapes names and URLs before placing them in HTML", () => {
  const content = createPasswordResetEmailContent({
    displayName: '<script>alert("x")</script>',
    resetUrl: 'https://example.com/reset?next=" onmouseover="alert(1)'
  });

  assert.doesNotMatch(content.html, /<script>/);
  assert.doesNotMatch(content.html, /onmouseover="alert/);
  assert.match(content.html, /&lt;script&gt;/);
  assert.match(content.html, /&quot; onmouseover=&quot;/);
});

test("Google provider is disabled unless both credentials are configured", () => {
  assert.equal(isGoogleAuthConfigured({}), false);
  assert.equal(isGoogleAuthConfigured({ GOOGLE_CLIENT_ID: "client" }), false);
  assert.deepEqual(getGoogleProviderConfig({ GOOGLE_CLIENT_ID: "client" }), {});
});

test("Google provider configuration trims credentials and requires account selection", () => {
  const environment = {
    GOOGLE_CLIENT_ID: " client-id ",
    GOOGLE_CLIENT_SECRET: " client-secret "
  };

  assert.equal(isGoogleAuthConfigured(environment), true);
  assert.deepEqual(getGoogleProviderConfig(environment), {
    google: {
      clientId: "client-id",
      clientSecret: "client-secret",
      prompt: "select_account"
    }
  });
});

test("authentication callbacks only accept local redirect paths", () => {
  assert.equal(getSafeLocalRedirect("/app/dashboard", "/fallback"), "/app/dashboard");
  assert.equal(
    getSafeLocalRedirect("/app/../dashboard?tab=account#security", "/fallback"),
    "/dashboard?tab=account#security"
  );
  assert.equal(getSafeLocalRedirect("//evil.example", "/fallback"), "/fallback");
  assert.equal(getSafeLocalRedirect("/\\evil.example", "/fallback"), "/fallback");
  assert.equal(getSafeLocalRedirect("/\n/evil.example", "/fallback"), "/fallback");
  assert.equal(getSafeLocalRedirect("/\r/evil.example", "/fallback"), "/fallback");
  assert.equal(getSafeLocalRedirect("/\t/evil.example", "/fallback"), "/fallback");
  assert.equal(getSafeLocalRedirect("/%0a/evil.example", "/fallback"), "/fallback");
  assert.equal(getSafeLocalRedirect("/%2f/evil.example", "/fallback"), "/fallback");
  assert.equal(getSafeLocalRedirect("/%5c/evil.example", "/fallback"), "/fallback");
  assert.equal(getSafeLocalRedirect("https://evil.example", "/fallback"), "/fallback");
});
