import { SignOutButton } from "@/components/auth/sign-out-button";

const marketingUrl =
  process.env.NEXT_PUBLIC_MARKETING_SITE_URL ?? "https://slpcc63.com";
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.slpcc63.com";

type SiteHeaderProps = {
  appMode?: boolean;
};

export function SiteHeader({ appMode = false }: SiteHeaderProps) {
  return (
    <header className="site-header shell">
      <nav className="nav">
        <a className="brand" href="/">
          SLPCC63
        </a>
        <div className="nav-links">
          {appMode ? (
            <>
              <a href={marketingUrl}>Marketing Site</a>
              <a href="/dashboard">Dashboard</a>
              <a className="pill" href="/">
                App Home
              </a>
              <SignOutButton />
            </>
          ) : (
            <>
              <a href="#roadmap">Roadmap</a>
              <a href="#stack">Stack</a>
              <a href={appUrl}>App</a>
              <a className="pill primary" href={appUrl}>
                Launch Product
              </a>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
