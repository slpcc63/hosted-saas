import { SiteHeader } from "@/components/site-header";
import { MarketingProductCatalog } from "@/components/marketing-product-catalog";
import { getPublishedMarketingProducts } from "@/lib/products";
import { ensureSeedCatalog } from "@/lib/seed";

export default async function HomePage() {
  await ensureSeedCatalog();
  const products = await getPublishedMarketingProducts();

  return (
    <>
      <SiteHeader />
      <main className="shell">
        <MarketingProductCatalog products={products} />
      </main>
    </>
  );
}
