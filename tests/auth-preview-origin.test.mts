import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getAppOrigin,
  getAuthPreviewOrigin,
  getBetterAuthOrigin,
  getBetterAuthTrustedOrigins,
  getVercelBranchOrigin
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

test("Preview also trusts Vercel's branch address so the pull-request Preview link can sign in", () => {
  const environment = previewEnvironment({
    VERCEL_BRANCH_URL: "hosted-saas-git-step-21-packages-5e0c21-slpcc63-8889s-projects.vercel.app"
  });

  assert.equal(
    getVercelBranchOrigin(environment),
    "https://hosted-saas-git-step-21-packages-5e0c21-slpcc63-8889s-projects.vercel.app"
  );
  assert.deepEqual(getBetterAuthTrustedOrigins(environment), [
    "https://generated-auth-preview.vercel.app",
    "https://hosted-saas-git-step-21-packages-5e0c21-slpcc63-8889s-projects.vercel.app"
  ]);
  assert.equal(
    getBetterAuthOrigin(environment),
    "https://generated-auth-preview.vercel.app"
  );
});

test("the branch address is never trusted outside Preview", () => {
  for (const vercelEnvironment of ["production", "development", undefined]) {
    const environment = previewEnvironment({
      VERCEL_ENV: vercelEnvironment,
      VERCEL_BRANCH_URL: "hosted-saas-git-main-slpcc63-8889s-projects.vercel.app"
    });

    assert.equal(getVercelBranchOrigin(environment), null, String(vercelEnvironment));
    assert.ok(
      !getBetterAuthTrustedOrigins(environment).some((origin) => origin.includes("-git-main-")),
      String(vercelEnvironment)
    );
  }
});

test("a branch address that is not a plain vercel.app host name is ignored", () => {
  const invalidBranchHosts = [
    "evil.example.com",
    "hosted-saas-git-x.vercel.app.evil.com",
    "hosted-saas-git-x.vercel.app/path",
    "https://hosted-saas-git-x.vercel.app",
    "user@hosted-saas-git-x.vercel.app",
    ""
  ];

  for (const host of invalidBranchHosts) {
    const environment = previewEnvironment({ VERCEL_BRANCH_URL: host });

    assert.equal(getVercelBranchOrigin(environment), null, host);
    assert.deepEqual(
      getBetterAuthTrustedOrigins(environment),
      ["https://generated-auth-preview.vercel.app"],
      host
    );
  }
});
