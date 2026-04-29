import "server-only";

import { db } from "@/lib/db";
import { ensurePlansTable, ensureProductsTable, Product } from "@/lib/products";

type SeedPlan = {
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

type SeedProduct = {
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

const seedProducts: SeedProduct[] = [
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

type SeededCatalog = {
  products: Product[];
};

function mapProduct(row: Record<string, unknown>): Product {
  return {
    id: String(row.id),
    title: String(row.title),
    slug: String(row.slug),
    category: String(row.category),
    platform: row.platform ? String(row.platform) : null,
    shortDescription: row.short_description ? String(row.short_description) : null,
    pricingModel: String(row.pricing_model),
    status: String(row.status),
    published: Boolean(row.published),
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at))
  };
}

async function upsertSeedProduct(product: SeedProduct) {
  const result = await db.query(
    `insert into public.products (
      title,
      slug,
      category,
      platform,
      short_description,
      pricing_model,
      status,
      published,
      demo_available,
      updated_at
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
    on conflict (slug)
    do update set
      title = excluded.title,
      category = excluded.category,
      platform = excluded.platform,
      short_description = excluded.short_description,
      pricing_model = excluded.pricing_model,
      status = excluded.status,
      published = excluded.published,
      demo_available = excluded.demo_available,
      updated_at = now()
    returning id, title, slug, category, platform, short_description, pricing_model, status, published, created_at, updated_at`,
    [
      product.title,
      product.slug,
      product.category,
      product.platform ?? null,
      product.shortDescription,
      product.pricingModel,
      product.status ?? "active",
      product.published ?? true,
      product.demoAvailable ?? false
    ]
  );

  return mapProduct(result.rows[0]);
}

async function upsertSeedPlan(productId: string, plan: SeedPlan) {
  const existing = await db.query(
    `select id
     from public.plans
     where product_id = $1 and name = $2
     limit 1`,
    [productId, plan.name]
  );

  if (existing.rows[0]) {
    await db.query(
      `update public.plans
       set description = $2,
           price = $3,
           billing_interval = $4,
           stripe_price_lookup_key = $5,
           features_included = $6,
           texting_enabled = $7,
           monthly_text_limit = $8,
           is_active = $9,
           sort_order = $10,
           updated_at = now()
       where id = $1`,
      [
        existing.rows[0].id,
        plan.description,
        plan.price,
        plan.billingInterval,
        plan.stripePriceLookupKey,
        plan.featuresIncluded,
        plan.textingEnabled ?? false,
        plan.monthlyTextLimit ?? 0,
        plan.isActive ?? true,
        plan.sortOrder
      ]
    );

    return String(existing.rows[0].id);
  }

  const inserted = await db.query(
    `insert into public.plans (
      product_id,
      name,
      description,
      price,
      billing_interval,
      stripe_price_lookup_key,
      features_included,
      texting_enabled,
      monthly_text_limit,
      is_active,
      sort_order,
      updated_at
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
    returning id`,
    [
      productId,
      plan.name,
      plan.description,
      plan.price,
      plan.billingInterval,
      plan.stripePriceLookupKey,
      plan.featuresIncluded,
      plan.textingEnabled ?? false,
      plan.monthlyTextLimit ?? 0,
      plan.isActive ?? true,
      plan.sortOrder
    ]
  );

  return String(inserted.rows[0].id);
}

export async function ensureSeedCatalog(): Promise<SeededCatalog> {
  await ensureProductsTable();
  await ensurePlansTable();

  const seeded: Product[] = [];

  for (const product of seedProducts) {
    const saved = await upsertSeedProduct(product);
    seeded.push(saved);

    if (!product.plans?.length) {
      continue;
    }

    for (const plan of product.plans) {
      await upsertSeedPlan(saved.id, plan);
    }
  }

  return {
    products: seeded
  };
}
