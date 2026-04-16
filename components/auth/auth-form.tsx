"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { authClient } from "@/lib/auth-client";

type AuthFormProps = {
  googleEnabled: boolean;
  nextPath: string;
};

export function AuthForm({ googleEnabled, nextPath }: AuthFormProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-up");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(formData: FormData) {
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    const name = String(formData.get("name") ?? "").trim();

    setError(null);

    if (mode === "sign-up" && !name) {
      setError("Add your name so we can create the first account.");
      return;
    }

    startTransition(async () => {
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
        return;
      }

      router.push(nextPath);
      router.refresh();
    });
  }

  return (
    <div>
      {googleEnabled ? (
        <>
          <button
            className="pill social-button"
            disabled={isPending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const response = await authClient.signIn.social({
                  provider: "google",
                  callbackURL: nextPath
                });

                if (response.error) {
                  setError(response.error.message ?? "Google sign-in failed.");
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

      <div className="auth-toggle">
        <button
          className={`pill-button auth-toggle-button${mode === "sign-up" ? " active" : ""}`}
          onClick={() => setMode("sign-up")}
          type="button"
        >
          Create account
        </button>
        <button
          className={`pill-button auth-toggle-button${mode === "sign-in" ? " active" : ""}`}
          onClick={() => setMode("sign-in")}
          type="button"
        >
          Sign in
        </button>
      </div>

      <form
        action={async (formData) => {
          await handleSubmit(formData);
        }}
        className="auth-form"
      >
        {mode === "sign-up" ? (
          <label className="field">
            <span>Name</span>
            <input autoComplete="name" name="name" placeholder="Your name" required />
          </label>
        ) : null}
        <label className="field">
          <span>Email</span>
          <input
            autoComplete="email"
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
            minLength={8}
            name="password"
            placeholder="At least 8 characters"
            type="password"
            required
          />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="pill primary auth-submit" disabled={isPending} type="submit">
          {isPending
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
      <Link className="pill" href="/dashboard">
        Dashboard after sign-in
      </Link>
    </div>
  );
}
