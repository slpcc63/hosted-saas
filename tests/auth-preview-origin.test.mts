import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getAppOrigin,
  getAuthPreviewOrigin,
  getBetterAuthOrigin,
  getBetterAuthTrustedOrigins
} from "../lib/deployment.ts";

function previewEnvironment(
  overrides: NodeJS.ProcessEnv = {}
): NodeJS.ProcessEnv {
  return {
    VERCEL_ENV: "preview",
    VERCEL_URL: "generated-auth-preview.vercel.app",
    NEXT_PUBLIC_APP_URL: "https://app.slpcc63.com",
    NEXT_PUBLIC_MARKETING_SITE_URL: "https://slpcc63.com",
    BETTER_AUTH_URL: "https://app.slpcc63.com",
    ...overrides
  };
}

test("a validated stable Preview origin drives Better Auth and trusts both Preview hosts", () => {
  const environment = previewEnvironment({
    AUTH_PREVIEW_ORIGIN: "https://auth-preview.slpcc63.com/"
  });

  assert.equal(
    getAuthPreviewOrigin(environment),
    "https://auth-preview.slpcc63.com"
  );
  assert.equal(
    getBetterAuthOrigin(environment),
    "https://auth-preview.slpcc63.com"
  );
  assert.equal(
    getAppOrigin(environment),
    "https://generated-auth-preview.vercel.app"
  );
  assert.deepEqual(getBetterAuthTrustedOrigins(environment), [
    "https://generated-auth-preview.vercel.app",
    "https://auth-preview.slpcc63.com"
  ]);
});

test("Preview falls back to the generated Vercel origin when no stable origin is configured", () => {
  const environment = previewEnvironment();

  assert.equal(getAuthPreviewOrigin(environment), null);
  assert.equal(
    getBetterAuthOrigin(environment),
    "https://generated-auth-preview.vercel.app"
  );
  assert.deepEqual(getBetterAuthTrustedOrigins(environment), [
    "https://generated-auth-preview.vercel.app"
  ]);
});

test("invalid stable Preview origins are rejected and use the generated fallback", () => {
  const invalidOrigins = [
    "http://auth-preview.slpcc63.com",
    "https://auth-preview.slpcc63.com/path",
    "https://auth-preview.slpcc63.com?mode=test",
    "https://auth-preview.slpcc63.com#fragment",
    "https://user:password@auth-preview.slpcc63.com",
    "not a URL"
  ];

  for (const invalidOrigin of invalidOrigins) {
    const environment = previewEnvironment({
      AUTH_PREVIEW_ORIGIN: invalidOrigin
    });

    assert.equal(getAuthPreviewOrigin(environment), null, invalidOrigin);
    assert.equal(
      getBetterAuthOrigin(environment),
      "https://generated-auth-preview.vercel.app",
      invalidOrigin
    );
  }
});

test("the Preview override cannot change Production origin behavior", () => {
  const environment: NodeJS.ProcessEnv = {
    VERCEL_ENV: "production",
    VERCEL_URL: "generated-auth-preview.vercel.app",
    AUTH_PREVIEW_ORIGIN: "https://auth-preview.slpcc63.com",
    NEXT_PUBLIC_APP_URL: "https://app.slpcc63.com",
    NEXT_PUBLIC_MARKETING_SITE_URL: "https://slpcc63.com",
    BETTER_AUTH_URL: "https://app.slpcc63.com"
  };

  assert.equal(getAuthPreviewOrigin(environment), null);
  assert.equal(getAppOrigin(environment), "https://app.slpcc63.com");
  assert.equal(getBetterAuthOrigin(environment), "https://app.slpcc63.com");
  assert.deepEqual(getBetterAuthTrustedOrigins(environment), [
    "https://app.slpcc63.com",
    "https://slpcc63.com"
  ]);
});
