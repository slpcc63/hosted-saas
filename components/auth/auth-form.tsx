"use client";

import type { FormEvent } from "react";
import Link from "next/link";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";

type AuthFormProps = {
  googleEnabled: boolean;
  nextPath: string;
};

export function AuthForm({ googleEnabled, nextPath }: AuthFormProps) {
  const [mode] = useState<"sign-in" | "sign-up">("sign-in");
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    const name = String(formData.get("name") ?? "").trim();

    setError(null);
    setStatusMessage(null);

    if (mode === "sign-up" && !name) {
      setError("Add your name so we can create the first account.");
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(mode === "sign-up" ? "Creating your account..." : "Signing you in...");

    try {
      const response =
        mode === "sign-up"
          ? await authClient.signUp.email({
              email,
              password,
              name,
              callbackURL: nextPath
            })
          : await authClient.signIn.email({
              email,
              password,
              callbackURL: nextPath
            });

      if (response.error) {
        setError(response.error.message ?? "Authentication failed.");
        setStatusMessage(null);
        return;
      }

      setStatusMessage(mode === "sign-up" ? "Account created. Redirecting..." : "Signed in. Redirecting...");
      window.location.assign(nextPath);
    } catch (authError) {
      setError(
        authError instanceof Error ? authError.message : "Authentication failed."
      );
      setStatusMessage(null);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      {googleEnabled ? (
        <>
          <button
            className="pill social-button"
            disabled={isSubmitting}
            onClick={() => {
              setError(null);
              setStatusMessage("Redirecting to Google...");
              setIsSubmitting(true);
              void (async () => {
                const response = await authClient.signIn.social({
                  provider: "google",
                  callbackURL: nextPath
                });

                if (response.error) {
                  setError(response.error.message ?? "Google sign-in failed.");
                  setStatusMessage(null);
                  setIsSubmitting(false);
                }
              });
            }}
            type="button"
          >
            Continue with Google
          </button>
          <div className="auth-divider">
            <span>or use email</span>
          </div>
        </>
      ) : null}

      <p className="auth-helper">Access is arranged with SLPCC63 support. Employees should use their employer-provided private link.</p>

      <form className="auth-form" onSubmit={handleSubmit}>
        {mode === "sign-up" ? (
          <label className="field">
            <span>Name</span>
            <input autoComplete="name" disabled={isSubmitting} name="name" placeholder="Your name" required />
          </label>
        ) : null}
        <label className="field">
          <span>Email</span>
          <input
            autoComplete="email"
            disabled={isSubmitting}
            name="email"
            placeholder="you@slpcc63.com"
            type="email"
            required
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
            disabled={isSubmitting}
            minLength={8}
            name="password"
            placeholder="At least 8 characters"
            type="password"
            required
          />
        </label>
        {statusMessage ? (
          <p aria-live="polite" className="form-success">
            {statusMessage}
          </p>
        ) : null}
        {error ? <p className="form-error">{error}</p> : null}
        <button className="pill primary auth-submit" disabled={isSubmitting} type="submit">
          {isSubmitting
            ? "Working..."
            : mode === "sign-up"
              ? "Create account"
              : "Sign in"}
        </button>
      </form>

      <p className="auth-helper">
        {mode === "sign-up"
          ? "This will create the first real app user in the Better Auth database."
          : "Use the account you created here to access the protected app routes."}
      </p>
      <Link className="pill" href={nextPath}>
        Dashboard after sign-in
      </Link>
    </div>
  );
}
