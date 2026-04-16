"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/server";
import { upsertWorkspace } from "@/lib/workspaces";

export async function saveWorkspaceAction(formData: FormData) {
  const session = await requireSession("/");
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const onboardingIntent = String(formData.get("onboardingIntent") ?? "").trim();
  const redirectTo = String(formData.get("redirectTo") ?? "/");

  if (!name) {
    redirect(`${redirectTo}?error=workspace_name_required`);
  }

  await upsertWorkspace({
    ownerId: session.user.id,
    name,
    description,
    onboardingIntent
  });

  revalidatePath("/");
  revalidatePath("/dashboard");
  redirect(`${redirectTo}?saved=workspace`);
}
