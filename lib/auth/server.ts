import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getAuth } from "@/lib/auth";

export async function getServerSession() {
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({
    headers: requestHeaders
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
