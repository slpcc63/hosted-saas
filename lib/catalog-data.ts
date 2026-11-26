// Catalog seed data, kept free of database and server-only imports so the
// public homepage can render it at build time without a database (PLAN 1.3).
// lib/seed.ts writes this same data to the database for the app pages.

import type { MarketingProduct } from "@/lib/products";

export type SeedPlan = {
  billingInterval: string;
  description: string;
  featuresIncluded: string[];
  isActive?: boolean;
  monthlyTextLimit?: number;
  name: string;
  price: number;
  sortOrder: number;
  stripePriceLookupKey: string;
  textingEnabled?: boolean;
};

export type SeedProduct = {
  category: string;
  demoAvailable?: boolean;
  plans?: SeedPlan[];
  platform?: string;
  pricingModel: string;
  published?: boolean;
  shortDescription: string;
  slug: string;
  status?: string;
  title: string;
};

export const seedProducts: SeedProduct[] = [
  {
    title: "Square Time Card Manager",
    slug: "square-time-card-manager",
    category: "square_plugin",
    platform: "Square",
    pricingModel: "subscription",
    shortDescription: "Current approved scope: connect Square, review open timecards, and manage missed clock-out notification workflows.",
    status: "active",
    published: true,
    demoAvailable: true,
    plans: [
      {
        name: "Operations",
        description: "Current approved phase 1 package for the Time Card Manager.",
        price: 79,
        billingInterval: "monthly",
        featuresIncluded: ["Email notifications"],
        sortOrder: 1,
        stripePriceLookupKey: "slpcc63_square_time_card_manager_operations_monthly",
        textingEnabled: false,
        monthlyTextLimit: 0
      },
      {
        name: "Scale",
        description: "Approved texting package for teams that need SMS notifications and a monthly text allowance.",
        price: 149,
        billingInterval: "monthly",
        featuresIncluded: ["Email notifications", "Text notifications"],
        sortOrder: 2,
        stripePriceLookupKey: "slpcc63_square_time_card_manager_scale_monthly",
        textingEnabled: true,
        monthlyTextLimit: 500
      }
    ]
  },
  {
    title: "Square Calendar Sync",
    slug: "square-calendar-sync",
    category: "square_plugin",
    platform: "Square",
    pricingModel: "subscription",
    shortDescription: "Backlog placeholder. Not currently offered to customers.",
    status: "draft",
    published: false,
    demoAvailable: false
  },
  {
    title: "Custom iOS and Android App Development",
    slug: "custom-ios-android-app-development",
    category: "mobile_app_development",
    platform: "iOS + Android",
    pricingModel: "custom_quote",
    shortDescription: "Backlog placeholder. Not currently offered to customers.",
    status: "draft",
    published: false
  },
  {
    title: "Square Plugin Consulting and Custom Development",
    slug: "square-plugin-consulting-custom-development",
    category: "consulting",
    platform: "Square + Web",
    pricingModel: "custom_quote",
    shortDescription: "Backlog placeholder. Not currently offered to customers.",
    status: "draft",
    published: false
  }
];

// Same selection and ordering as getPublishedMarketingProducts() in lib/products.ts,
// computed from the seed data instead of the database.
export function getPublishedSeedMarketingProducts(): MarketingProduct[] {
  const products = seedProducts
    .filter((product) => product.published === true && product.status === "active")
    .map((product): MarketingProduct => {
      const activePlans = (product.plans ?? []).filter((plan) => plan.isActive ?? true);
      const monthlyPrices = activePlans
        .filter((plan) => plan.billingInterval === "monthly")
        .map((plan) => plan.price);

      return {
        category: product.category,
        id: product.slug,
        monthlyStartingPrice: monthlyPrices.length ? Math.min(...monthlyPrices) : null,
        platform: product.platform ?? null,
        planCount: activePlans.length,
        pricingModel: product.pricingModel,
        shortDescription: product.shortDescription || null,
        slug: product.slug,
        title: product.title
      };
    });

  return products.sort((a, b) => {
    const modelOrder =
      (a.pricingModel === "subscription" ? 0 : 1) - (b.pricingModel === "subscription" ? 0 : 1);
    if (modelOrder !== 0) return modelOrder;
    const priceOrder = (a.monthlyStartingPrice ?? 999999) - (b.monthlyStartingPrice ?? 999999);
    if (priceOrder !== 0) return priceOrder;
    return a.title < b.title ? -1 : a.title > b.title ? 1 : 0;
  });
}
