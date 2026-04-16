import { SignOutButton } from "@/components/auth/sign-out-button";
import { getPublicRouting } from "@/lib/request-routing";

type SiteHeaderProps = {
  appMode?: boolean;
};

export async function SiteHeader({ appMode = false }: SiteHeaderProps) {
  const routing = await getPublicRouting();

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
              <a className="pill" href={routing.appHomePath}>
                App Home
              </a>
              <SignOutButton />
            </>
          ) : (
            <>
              <a href="#roadmap">Roadmap</a>
              <a href="#stack">Stack</a>
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
