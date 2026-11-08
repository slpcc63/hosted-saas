"use client";

import type { FormEvent } from "react";
import Link from "next/link";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";

type ResetPasswordFormProps = {
  initialError?: string;
  signInPath: string;
  token?: string;
};

export function ResetPasswordForm({
  initialError,
  signInPath,
  token
}: ResetPasswordFormProps) {
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resetComplete, setResetComplete] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token) {
      setError("This password reset link is invalid or has expired. Request a new one.");
      return;
    }

    const formData = new FormData(event.currentTarget);
    const newPassword = String(formData.get("newPassword") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (newPassword !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await authClient.resetPassword({ newPassword, token });

      if (response.error) {
        setError(
          response.error.message ??
            "This password reset link is invalid or has expired. Request a new one."
        );
        return;
      }

      setResetComplete(true);
    } catch (resetError) {
      setError(
        resetError instanceof Error
          ? resetError.message
          : "Unable to reset your password."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (resetComplete) {
    return (
      <div>
        <p aria-live="polite" className="form-success">
          Your password has been changed and existing sessions have been signed out.
        </p>
        <Link className="pill primary" href={signInPath}>
          Sign in with your new password
        </Link>
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <label className="field">
        <span>New password</span>
        <input
          autoComplete="new-password"
          disabled={isSubmitting || !token}
          minLength={8}
          name="newPassword"
          placeholder="At least 8 characters"
          required
          type="password"
        />
      </label>
      <label className="field">
        <span>Confirm new password</span>
        <input
          autoComplete="new-password"
          disabled={isSubmitting || !token}
          minLength={8}
          name="confirmPassword"
          required
          type="password"
        />
      </label>
      {error ? <p className="form-error">{error}</p> : null}
      <button
        className="pill primary auth-submit"
        disabled={isSubmitting || !token}
        type="submit"
      >
        {isSubmitting ? "Changing password..." : "Change password"}
      </button>
      {!token ? (
        <Link className="pill" href={signInPath}>
          Request a new reset link
        </Link>
      ) : null}
    </form>
  );
}
