import { SignOutButton } from "@/components/auth/sign-out-button";
import { getServerSession } from "@/lib/auth/server";
import { isAdmin } from "@/lib/authorization";
import { getPublicRouting } from "@/lib/request-routing";

type SiteHeaderProps = {
  appMode?: boolean;
};

export async function SiteHeader({ appMode = false }: SiteHeaderProps) {
  const routing = await getPublicRouting();
  const session = appMode ? await getServerSession() : null;
  const admin = session?.user ? await isAdmin(session.user.id) : false;

  return (
    <header className="site-header shell">
      <nav className="nav">
        <a className="brand" href="/">
          SLPCC63
        </a>
        <div className="nav-links">
          {appMode ? (
            <>
              <a href={routing.marketingHref}>Marketing Site</a>
              <a href={routing.dashboardPath}>Dashboard</a>
              <a href={routing.appHost ? "/time-card-manager" : "/app/time-card-manager"}>Time Card Manager</a>
              <a href={routing.appHost ? "/subscriptions" : "/app/subscriptions"}>Subscriptions</a>
              <a href={routing.appHost ? "/account" : "/app/account"}>Account</a>
              {admin ? (
                <a href={routing.appHost ? "/admin/products" : "/app/admin/products"}>Admin Products</a>
              ) : null}
              <SignOutButton />
            </>
          ) : (
            <>
              <a href="#products">Products</a>
              <a href="#filters">Filters</a>
              <a href={routing.launchProductHref}>App</a>
              <a className="pill primary" href={routing.launchProductHref}>
                Launch Product
              </a>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
