import { SiteHeader } from "@/components/site-header";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.slpcc63.com";
const rootDomain =
  process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "slpcc63.com";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main className="shell">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">Vercel-First SaaS Starter</div>
            <h1>Marketing at the root. Product on the app subdomain.</h1>
            <p>
              This scaffold now assumes a single Next.js codebase deployed on
              Vercel, with the public marketing experience on
              {" "}
              <code>{rootDomain}</code>
              {" "}
              and the actual SaaS product on
              {" "}
              <code>app.{rootDomain}</code>
              .
            </p>
            <div className="hero-actions">
              <a className="pill primary" href={appUrl}>
                Open planned app URL
              </a>
              <a className="pill" href="#stack">
                See the stack
              </a>
            </div>
          </div>
          <aside className="hero-card">
            <h2>Recommended launch shape</h2>
            <div className="metrics">
              <div className="metric">
                <strong>{rootDomain}</strong>
                Marketing site, product positioning, waitlist, pricing, and
                onboarding funnel.
              </div>
              <div className="metric">
                <strong>app.{rootDomain}</strong>
                Authenticated product, billing, account state, and customer
                workflows.
              </div>
              <div className="metric">
                <strong>One deployment workflow</strong>
                One host, one DNS panel, one SSL setup, and preview deploys
                built in.
              </div>
            </div>
          </aside>
        </section>

        <section className="section" id="stack">
          <div className="eyebrow">Starter Stack</div>
          <h2 className="section-title">Built for a single Vercel setup that can still grow cleanly.</h2>
          <div className="feature-grid">
            <article className="feature-card">
              <h3>Host-aware routing</h3>
              <p>
                Requests for the app subdomain are rewritten to internal product
                routes, so the app can own `/` on `app.slpcc63.com` without
                disturbing the marketing homepage.
              </p>
            </article>
            <article className="feature-card">
              <h3>Single codebase</h3>
              <p>
                Marketing and product can share components, auth logic, design
                tokens, and deployment flow while still feeling like separate
                surfaces to customers.
              </p>
            </article>
            <article className="feature-card">
              <h3>Environment-first</h3>
              <p>
                Placeholders are ready for auth, Stripe, email, and a database
                once you pick the services that will back the app.
              </p>
            </article>
          </div>
        </section>

        <section className="section" id="roadmap">
          <div className="eyebrow">Immediate Next Steps</div>
          <ol className="checklist">
            <li>Buy or transfer `slpcc63.com` into Vercel.</li>
            <li>Attach both the apex domain and `app.slpcc63.com` to this project.</li>
            <li>Add authentication and make the app root your first protected experience.</li>
            <li>Connect billing, email, and the initial product data model.</li>
          </ol>
        </section>
      </main>
    </>
  );
}
