import { ResponsiveNavMenu } from "@/components/responsive-nav-menu";
import { ownerSignIn } from "@/lib/public-products";

export function PublicSiteHeader() {
  return <header className="site-header shell"><nav className="nav" aria-label="Main navigation">
    <a className="brand" href="/">SLPCC63</a>
    <ResponsiveNavMenu>
      <a href="/#products">Products</a><a href="/#how-it-works">How it works</a>
      <a href="/#availability">Availability / pricing</a>
      <a href="/privacy">Privacy</a><a href="/terms">Terms</a>
      <a className="pill primary" href={ownerSignIn}>Sign in</a>
    </ResponsiveNavMenu>
  </nav></header>;
}
