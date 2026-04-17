"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/server";
import { createWorkItem, updateWorkItemStatus } from "@/lib/work-items";
import {
  getSquareConnectionByWorkspaceId,
  removeSquareConnection
} from "@/lib/square-connections";
import { revokeSquareAccessToken } from "@/lib/square";
import { upsertWorkspace } from "@/lib/workspaces";

export async function saveWorkspaceAction(formData: FormData) {
  const redirectTo = String(formData.get("redirectTo") ?? "/");
  const session = await requireSession(redirectTo);
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const onboardingIntent = String(formData.get("onboardingIntent") ?? "").trim();

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

export async function createWorkItemAction(formData: FormData) {
  const redirectTo = String(formData.get("redirectTo") ?? "/dashboard");
  const session = await requireSession(redirectTo);
  const title = String(formData.get("title") ?? "").trim();
  const details = String(formData.get("details") ?? "").trim();
  const workspaceId = String(formData.get("workspaceId") ?? "").trim();

  if (!workspaceId) {
    redirect(`${redirectTo}?error=workspace_required`);
  }

  if (!title) {
    redirect(`${redirectTo}?error=work_item_title_required`);
  }

  await createWorkItem({
    workspaceId,
    title,
    details
  });

  revalidatePath("/");
  revalidatePath("/dashboard");
  redirect(`${redirectTo}?saved=work_item`);
}

export async function updateWorkItemStatusAction(formData: FormData) {
  const redirectTo = String(formData.get("redirectTo") ?? "/dashboard");
  await requireSession(redirectTo);
  const workItemId = String(formData.get("workItemId") ?? "").trim();
  const workspaceId = String(formData.get("workspaceId") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();

  if (!workspaceId || !workItemId) {
    redirect(`${redirectTo}?error=work_item_missing`);
  }

  if (status !== "backlog" && status !== "active" && status !== "done") {
    redirect(`${redirectTo}?error=work_item_status_invalid`);
  }

  await updateWorkItemStatus({
    workspaceId,
    workItemId,
    status
  });

  revalidatePath("/");
  revalidatePath("/dashboard");
  redirect(`${redirectTo}?saved=work_item`);
}

export async function disconnectSquareAction(formData: FormData) {
  const redirectTo = String(formData.get("redirectTo") ?? "/dashboard");
  await requireSession(redirectTo);
  const workspaceId = String(formData.get("workspaceId") ?? "").trim();

  if (!workspaceId) {
    redirect(`${redirectTo}?error=workspace_required`);
  }

  const connection = await getSquareConnectionByWorkspaceId(workspaceId);

  if (!connection) {
    redirect(`${redirectTo}?error=square_not_connected`);
  }

  await revokeSquareAccessToken(connection.accessToken);
  await removeSquareConnection(workspaceId);

  revalidatePath("/");
  revalidatePath("/dashboard");
  redirect(`${redirectTo}?saved=square_disconnected`);
}
