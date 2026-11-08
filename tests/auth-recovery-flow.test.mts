import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";

import { getEmailAndPasswordConfig } from "../lib/auth-password-config.ts";

type CapturedReset = {
  email: string;
  token: string;
  url: string;
};

const baseURL = "http://localhost:3000";

function getSessionCookie(response: Response) {
  const setCookies = response.headers.getSetCookie();
  const sessionCookie = setCookies.find((value) =>
    value.startsWith("better-auth.session_token=")
  );

  assert.ok(sessionCookie, "authentication response should set a session cookie");
  return sessionCookie.split(";", 1)[0];
}

test("password recovery lifecycle works against an isolated in-memory database", async (t) => {
  const database = new DatabaseSync(":memory:");
  const capturedResets: CapturedReset[] = [];
  const auth = betterAuth({
    appName: "SLPCC63 recovery test",
    baseURL,
    database,
    secret: "isolated-auth-test-secret-long-enough-for-better-auth",
    trustedOrigins: [baseURL],
    emailAndPassword: getEmailAndPasswordConfig(async ({ user, token, url }) => {
      capturedResets.push({ email: user.email, token, url });
    }),
    logger: { disabled: true },
    rateLimit: { enabled: false }
  });

  t.after(() => database.close());

  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();

  async function request(
    path: string,
    options: {
      body?: Record<string, unknown>;
      cookie?: string;
      method?: "GET" | "POST";
    } = {}
  ) {
    const headers = new Headers({ Origin: baseURL });

    if (options.body) {
      headers.set("Content-Type", "application/json");
    }

    if (options.cookie) {
      headers.set("Cookie", options.cookie);
    }

    return auth.handler(
      new Request(`${baseURL}/api/auth${path}`, {
        body: options.body ? JSON.stringify(options.body) : undefined,
        headers,
        method: options.method ?? (options.body ? "POST" : "GET")
      })
    );
  }

  const email = "recovery-user@example.test";
  const originalPassword = "original-password-123";
  const newPassword = "new-password-456";

  const signUpResponse = await request("/sign-up/email", {
    body: {
      email,
      name: "Recovery User",
      password: originalPassword
    }
  });
  assert.equal(signUpResponse.status, 200);

  const oldSessionResponse = await request("/sign-in/email", {
    body: { email, password: originalPassword }
  });
  assert.equal(oldSessionResponse.status, 200);
  const oldSessionCookie = getSessionCookie(oldSessionResponse);

  const existingRequestResponse = await request("/request-password-reset", {
    body: { email, redirectTo: `${baseURL}/reset-password` }
  });
  assert.equal(existingRequestResponse.status, 200);
  const existingRequestBody = await existingRequestResponse.json();
  assert.equal(capturedResets.length, 1);
  assert.equal(capturedResets[0]?.email, email);
  assert.match(capturedResets[0]?.url ?? "", /\/api\/auth\/reset-password\//);

  const missingRequestResponse = await request("/request-password-reset", {
    body: {
      email: "missing-user@example.test",
      redirectTo: `${baseURL}/reset-password`
    }
  });
  assert.equal(missingRequestResponse.status, 200);
  assert.deepEqual(await missingRequestResponse.json(), existingRequestBody);
  assert.equal(capturedResets.length, 1, "missing users must not trigger delivery");

  const expiredToken = capturedResets[0]?.token;
  assert.ok(expiredToken);
  const expirationUpdate = database
    .prepare("update verification set expiresAt = 0 where identifier = ?")
    .run(`reset-password:${expiredToken}`);
  assert.equal(expirationUpdate.changes, 1);

  const expiredResetResponse = await request("/reset-password", {
    body: { newPassword, token: expiredToken }
  });
  assert.equal(expiredResetResponse.status, 400);
  assert.equal((await expiredResetResponse.json()).code, "INVALID_TOKEN");

  const validRequestResponse = await request("/request-password-reset", {
    body: { email, redirectTo: `${baseURL}/reset-password` }
  });
  assert.equal(validRequestResponse.status, 200);
  assert.equal(capturedResets.length, 2);
  const validToken = capturedResets[1]?.token;
  assert.ok(validToken);

  const validResetResponse = await request("/reset-password", {
    body: { newPassword, token: validToken }
  });
  assert.equal(validResetResponse.status, 200);
  assert.deepEqual(await validResetResponse.json(), { status: true });

  const reusedResetResponse = await request("/reset-password", {
    body: { newPassword: "another-password-789", token: validToken }
  });
  assert.equal(reusedResetResponse.status, 400);
  assert.equal((await reusedResetResponse.json()).code, "INVALID_TOKEN");

  const revokedSessionResponse = await request("/get-session", {
    cookie: oldSessionCookie
  });
  assert.equal(revokedSessionResponse.status, 200);
  assert.equal(await revokedSessionResponse.json(), null);

  const oldPasswordResponse = await request("/sign-in/email", {
    body: { email, password: originalPassword }
  });
  assert.equal(oldPasswordResponse.status, 401);

  const newPasswordResponse = await request("/sign-in/email", {
    body: { email, password: newPassword }
  });
  assert.equal(newPasswordResponse.status, 200);
  assert.ok(getSessionCookie(newPasswordResponse));
});
