import { SiteHeader } from "@/components/site-header";
import { MarketingProductCatalog } from "@/components/marketing-product-catalog";
import { getPublishedMarketingProducts } from "@/lib/products";
import type { MarketingProduct } from "@/lib/products";
import { ensureSeedCatalog } from "@/lib/seed";

const closingChecklistPrototype: MarketingProduct = {
  category: "square_plugin",
  id: "closing-checklist-guided-prototype",
  marketingLink: {
    external: true,
    href: "https://closing-checklist-platform.vercel.app",
    label: "Open interactive prototype"
  },
  marketingStatus: "Prototype · demo data resets",
  monthlyStartingPrice: null,
  planCount: 0,
  platform: "Square concept",
  pricingModel: "prototype",
  shortDescription:
    "Explore a guided closing workflow with sample tasks, exceptions, manager review, and a simulated clock-out. It does not save data or change Square.",
  slug: "closing-checklist",
  title: "Closing Checklist"
};

export default async function HomePage() {
  // The controlled account preview must not run catalog DDL during its build.
  // Other environments retain their existing rendering behavior.
  if (process.env.SLPCC63_CONTROLLED_PREVIEW === "1") await connection();
  await ensureSeedCatalog();
  const products = await getPublishedMarketingProducts();
  const assistedDemoProducts = products.map((product) =>
    product.slug === "square-time-card-manager"
      ? {
          ...product,
          marketingLink: {
            href: "/app/time-card-manager",
            label: "Open assisted demo"
          },
          marketingStatus: "Assisted demo"
        }
      : product
  );

  return (
    <>
      <SiteHeader />
      <main className="shell">
        <MarketingProductCatalog products={[...assistedDemoProducts, closingChecklistPrototype]} />
      </main>
    </>
  );
}
import { connection } from "next/server";

