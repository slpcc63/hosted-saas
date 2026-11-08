import assert from "node:assert/strict";
import test from "node:test";

import { runGoogleSignIn } from "../lib/google-sign-in.ts";

test("Google click behavior makes exactly one social sign-in request", async () => {
  const requests: Array<{ callbackURL: string; provider: "google" }> = [];
  const submitting: boolean[] = [];
  const statuses: Array<string | null> = [];
  const errors: Array<string | null> = [];

  const redirected = await runGoogleSignIn({
    callbackURL: "/app/dashboard",
    onError: (message) => errors.push(message),
    onStatusChange: (message) => statuses.push(message),
    onSubmittingChange: (value) => submitting.push(value),
    signIn: async (request) => {
      requests.push(request);
      return {};
    }
  });

  assert.equal(redirected, true);
  assert.deepEqual(requests, [
    { provider: "google", callbackURL: "/app/dashboard" }
  ]);
  assert.deepEqual(submitting, [true]);
  assert.deepEqual(statuses, ["Redirecting to Google..."]);
  assert.deepEqual(errors, [null]);
});

test("Google click behavior unlocks after rejection and permits a retry", async () => {
  let attempts = 0;
  let submitting = false;
  let status: string | null = null;
  let error: string | null = null;

  const click = () => runGoogleSignIn({
    callbackURL: "/dashboard",
    onError: (message) => {
      error = message;
    },
    onStatusChange: (message) => {
      status = message;
    },
    onSubmittingChange: (value) => {
      submitting = value;
    },
    signIn: async () => {
      attempts += 1;

      if (attempts === 1) {
        throw new Error("Google is temporarily unavailable.");
      }

      return {};
    }
  });

  assert.equal(await click(), false);
  assert.equal(attempts, 1);
  assert.equal(submitting, false);
  assert.equal(status, null);
  assert.equal(error, "Google is temporarily unavailable.");

  assert.equal(await click(), true);
  assert.equal(attempts, 2);
  assert.equal(submitting, true);
  assert.equal(status, "Redirecting to Google...");
  assert.equal(error, null);
});

test("Google provider error responses clear redirect state", async () => {
  let submitting = false;
  let status: string | null = null;
  let error: string | null = null;

  const redirected = await runGoogleSignIn({
    callbackURL: "/dashboard",
    onError: (message) => {
      error = message;
    },
    onStatusChange: (message) => {
      status = message;
    },
    onSubmittingChange: (value) => {
      submitting = value;
    },
    signIn: async () => ({
      error: { message: "The Google account could not be authorized." }
    })
  });

  assert.equal(redirected, false);
  assert.equal(submitting, false);
  assert.equal(status, null);
  assert.equal(error, "The Google account could not be authorized.");
});
