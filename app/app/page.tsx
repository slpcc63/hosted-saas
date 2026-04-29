import { getPublicRouting } from "@/lib/request-routing";
import { redirect } from "next/navigation";

export default async function AppHomePage() {
  const routing = await getPublicRouting();
  redirect(routing.dashboardPath);
}
