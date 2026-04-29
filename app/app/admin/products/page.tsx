import { SiteHeader } from "@/components/site-header";
import { createProductAction } from "@/app/app/actions";
import { requireAdminUser } from "@/lib/admin";
import { getPublicRouting } from "@/lib/request-routing";
import { ensureSeedCatalog } from "@/lib/seed";
import { getAdminProducts } from "@/lib/products";

type AdminProductsPageProps = {
  searchParams?: Promise<{
    error?: string;
    saved?: string;
  }>;
};

export default async function AdminProductsPage({ searchParams }: AdminProductsPageProps) {
  const routing = await getPublicRouting();
  await requireAdminUser(
    routing.appHost ? "/admin/products" : "/app/admin/products",
    routing.dashboardPath
  );
  await ensureSeedCatalog();
  const products = await getAdminProducts();
  const params = await searchParams;
  const redirectTo = routing.appHost ? "/admin/products" : "/app/admin/products";

  return (
    <>
      <SiteHeader appMode />
      <main className="shell dashboard">
        <div className="eyebrow">Admin Products</div>
        <div className="dashboard-grid">
          <section className="dashboard-card">
            <h1>Product catalog admin</h1>
            <p>
              This is the internal screen for product records that power the
              public site and customer app. Only approved offerings should be
              marked active and published.
            </p>
            {params?.saved === "product" ? (
              <p className="form-success">Product saved successfully.</p>
            ) : null}
            {params?.error === "product_title_required" ? (
              <p className="form-error">Please add a product title before saving.</p>
            ) : null}
            <form action={createProductAction} className="auth-form">
              <input name="redirectTo" type="hidden" value={redirectTo} />
              <label>
                Title
                <input name="title" placeholder="Square Calendar Sync" required type="text" />
              </label>
              <label>
                Category
                <select defaultValue="square_plugin" name="category">
                  <option value="square_plugin">Square plugin</option>
                  <option value="mobile_app_development">Mobile app development</option>
                  <option value="consulting">Consulting</option>
                  <option value="custom_development">Custom development</option>
                </select>
              </label>
              <label>
                Platform
                <input name="platform" placeholder="Square, iOS, Android, Web" type="text" />
              </label>
              <label>
                Short description
                <textarea name="shortDescription" placeholder="Short customer-facing summary" rows={3} />
              </label>
              <label>
                Pricing model
                <select defaultValue="subscription" name="pricingModel">
                  <option value="subscription">Subscription</option>
                  <option value="one_time">One time</option>
                  <option value="custom_quote">Custom quote</option>
                </select>
              </label>
              <label>
                Status
                <select defaultValue="draft" name="status">
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="coming_soon">Coming soon</option>
                  <option value="retired">Retired</option>
                </select>
              </label>
              <label className="checkbox-row">
                <input name="published" type="checkbox" />
                Publish immediately
              </label>
              <button className="pill primary pill-button" type="submit">
                Save product
              </button>
            </form>
          </section>

          <aside className="dashboard-card">
            <h2>Current products</h2>
            {products.length === 0 ? (
              <div className="metric">
                <strong>No products yet</strong>
                Add an approved product record when you are ready to expose it.
              </div>
            ) : (
              <div className="stack-list">
                {products.map((product) => (
                  <article className="dashboard-subcard" key={product.id}>
                    <div className="subcard-header">
                      <div>
                        <h2>{product.title}</h2>
                        <p>{product.category.replaceAll("_", " ")}</p>
                      </div>
                      <span className="status-chip">{product.status}</span>
                    </div>
                    <p>{product.shortDescription ?? "No description added yet."}</p>
                    <div className="stat-row compact">
                      <div className="stat">
                        <strong>Pricing</strong>
                        {product.pricingModel.replaceAll("_", " ")}
                      </div>
                      <div className="stat">
                        <strong>Platform</strong>
                        {product.platform ?? "Not set"}
                      </div>
                      <div className="stat">
                        <strong>Published</strong>
                        {product.published ? "Yes" : "No"}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </aside>
        </div>
      </main>
    </>
  );
}
