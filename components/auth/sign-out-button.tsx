"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      className="pill primary pill-button"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          await authClient.signOut();
          router.push("/sign-in");
          router.refresh();
        });
      }}
      type="button"
    >
      {isPending ? "Signing out..." : "Sign out"}
    </button>
  );
}
