import { PublicSiteHeader } from "@/components/public-site-header";
import { ownerSignIn, publicProducts } from "@/lib/public-products";

export default function HomePage() {
  return <>
    <PublicSiteHeader />
    <main className="shell main-site">
      <section className="suite-intro" aria-labelledby="suite-title">
        <p className="eyebrow">Practical tools for Square teams</p>
        <h1 id="suite-title">A clearer workday.<br />From schedules to closing.</h1>
        <p className="suite-lead">Bring employee schedules into personal calendars, review missing punches, and explore a better closing routine.</p>
        <p>Three focused tools, each with a clear scope. Calendar Sync is in a controlled pilot, Time Card Manager is available by assisted demo, and Closing Checklist is an interactive prototype.</p>
        <div className="suite-actions"><a className="pill primary" href="#products">Explore the tools</a><a className="pill" href={ownerSignIn}>Existing customer sign-in</a></div>
      </section>
      <section id="products" aria-labelledby="products-title">
        <p className="eyebrow">The suite</p><h2 id="products-title">The right tool for the next task.</h2>
        {publicProducts.map((product, index) => <article className="suite-product" id={product.id} key={product.id}>
          <div><p className="eyebrow">0{index + 1} / {product.status}</p><h3>{product.title}</h3>
            <p className="suite-benefit">{product.benefit}</p><p className="suite-audience">{product.audience}</p>
            <a className="pill primary" href={product.href}>{product.action}</a></div>
          <div className="suite-details"><p>{product.description}</p>
            <h4>What it does with Square</h4><p>{product.square}</p>
            <h4>How people access it</h4><p>{product.access}</p>
            <h4>Availability and pricing</h4><p>{product.availability}</p></div>
        </article>)}
      </section>
      <section className="suite-section" id="how-it-works" aria-labelledby="access-title">
        <p className="eyebrow">Two simple paths</p><h2 id="access-title">Managers sign in. Employees follow a private link.</h2>
        <div className="suite-access">
          <div><h3>Owners and managers</h3><p>Sign in to manage your account and open installed tools. Square authorization happens through Square. Pilot and demo access require assisted onboarding.</p><a className="pill" href={ownerSignIn}>Sign in to your account</a></div>
          <div><h3>Employees</h3><p>Use the private calendar setup or time-confirmation link your employer provides. You do not need to register here. If a link is missing or expired, ask your manager for a new one.</p><p>Keep private links private: anyone with a working link may be able to use it.</p></div>
        </div>
      </section>
      <section className="suite-section" id="availability" aria-labelledby="availability-title">
        <p className="eyebrow">Current availability</p><h2 id="availability-title">Assisted access, with clear expectations.</h2>
        <p>Public paid onboarding is not open. Existing customers can sign in to their installed tools. New pilot or demo access is arranged directly with your SLPCC63 contact; signing in does not automatically grant access.</p>
        <p>Closing Checklist can be explored using sample data. It resets on reload and does not perform a real Square clock-out.</p>
      </section>
    </main>
    <footer className="shell suite-footer"><span>SLPCC63 · Tools for the workday</span><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href={ownerSignIn}>Customer sign-in</a></footer>
  </>;
}
