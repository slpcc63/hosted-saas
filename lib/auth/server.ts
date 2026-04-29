import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

export async function getServerSession() {
  const session = await auth.api.getSession({
    headers: await headers()
  });

  return session;
}

export async function requireSession(nextPath: string) {
  const session = await getServerSession();

  if (!session?.user) {
    redirect(`/sign-in?next=${encodeURIComponent(nextPath)}`);
  }

  return session;
}

export async function requireUserId(nextPath: string) {
  const session = await requireSession(nextPath);

  return session.user.id;
}
