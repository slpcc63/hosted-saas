import "server-only";

import { db } from "@/lib/db";

export type Product = {
  id: string;
  title: string;
  slug: string;
  category: string;
  platform: string | null;
  shortDescription: string | null;
  pricingModel: string;
  status: string;
  published: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type PlanCatalogItem = {
  billingInterval: string;
  description: string | null;
  featuresIncluded: string[];
  monthlyTextLimit: number;
  planId: string;
  planName: string;
  price: number;
  productCategory: string;
  productId: string;
  productSlug: string;
  productTitle: string;
  stripePriceLookupKey: string | null;
  textingEnabled: boolean;
};

export type MarketingProduct = {
  category: string;
  id: string;
  monthlyStartingPrice: number | null;
  platform: string | null;
  planCount: number;
  pricingModel: string;
  shortDescription: string | null;
  slug: string;
  title: string;
};

export type CreateProductInput = {
  title: string;
  slug: string;
  category: string;
  platform?: string;
  shortDescription?: string;
  pricingModel: string;
  status?: string;
  published?: boolean;
};

let productsTableReady: Promise<void> | null = null;
let plansTableReady: Promise<void> | null = null;

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

function mapPlanCatalogItem(row: Record<string, unknown>): PlanCatalogItem {
  return {
    billingInterval: String(row.billing_interval),
    description: row.description ? String(row.description) : null,
    featuresIncluded: Array.isArray(row.features_included)
      ? row.features_included.map((entry) => String(entry))
      : [],
    monthlyTextLimit: Number(row.monthly_text_limit ?? 0),
    planId: String(row.plan_id),
    planName: String(row.plan_name),
    price: Number(row.price),
    productCategory: String(row.product_category),
    productId: String(row.product_id),
    productSlug: String(row.product_slug),
    productTitle: String(row.product_title),
    stripePriceLookupKey: row.stripe_price_lookup_key ? String(row.stripe_price_lookup_key) : null,
    textingEnabled: Boolean(row.texting_enabled)
  };
}

function mapMarketingProduct(row: Record<string, unknown>): MarketingProduct {
  return {
    category: String(row.category),
    id: String(row.id),
    monthlyStartingPrice:
      row.monthly_starting_price === null || row.monthly_starting_price === undefined
        ? null
        : Number(row.monthly_starting_price),
    platform: row.platform ? String(row.platform) : null,
    planCount: Number(row.plan_count ?? 0),
    pricingModel: String(row.pricing_model),
    shortDescription: row.short_description ? String(row.short_description) : null,
    slug: String(row.slug),
    title: String(row.title)
  };
}

export async function ensureProductsTable() {
  if (!productsTableReady) {
    productsTableReady = db.query(`
      create extension if not exists pgcrypto;

      create table if not exists public.products (
        id uuid primary key default gen_random_uuid(),
        title text not null,
        slug text not null unique,
        category text not null,
        platform text,
        short_description text,
        full_description text,
        use_cases text[] not null default '{}',
        feature_list text[] not null default '{}',
        pricing_model text not null,
        base_price numeric(10,2),
        cta_type text,
        status text not null default 'draft',
        hero_media_url text,
        demo_available boolean not null default false,
        published boolean not null default false,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
    `).then(() => undefined);
  }

  return productsTableReady;
}

export async function ensurePlansTable() {
  await ensureProductsTable();

  if (!plansTableReady) {
    plansTableReady = db.query(`
      create extension if not exists pgcrypto;

      create table if not exists public.plans (
        id uuid primary key default gen_random_uuid(),
        product_id uuid not null references public.products(id) on delete cascade,
        name text not null,
        description text,
        price numeric(10,2) not null,
        billing_interval text not null,
        stripe_price_lookup_key text unique,
        features_included text[] not null default '{}',
        texting_enabled boolean not null default false,
        monthly_text_limit integer not null default 0,
        is_active boolean not null default true,
        sort_order integer not null default 0,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      alter table public.plans
        add column if not exists stripe_price_lookup_key text unique;

      alter table public.plans
        add column if not exists texting_enabled boolean not null default false;

      alter table public.plans
        add column if not exists monthly_text_limit integer not null default 0;
    `).then(() => undefined);
  }

  return plansTableReady;
}

export async function getAdminProducts() {
  await ensureProductsTable();

  const result = await db.query(
    `select id, title, slug, category, platform, short_description, pricing_model, status, published, created_at, updated_at
     from public.products
     order by created_at desc`
  );

  return result.rows.map((row) => mapProduct(row));
}

export async function createProduct(input: CreateProductInput) {
  await ensureProductsTable();

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
      updated_at
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, now())
    returning id, title, slug, category, platform, short_description, pricing_model, status, published, created_at, updated_at`,
    [
      input.title.trim(),
      input.slug.trim(),
      input.category.trim(),
      input.platform?.trim() || null,
      input.shortDescription?.trim() || null,
      input.pricingModel.trim(),
      input.status?.trim() || "draft",
      input.published ?? false
    ]
  );

  return mapProduct(result.rows[0]);
}

export async function getPublishedSubscriptionPlans() {
  await ensurePlansTable();

  const result = await db.query(
    `select
        plans.id as plan_id,
        plans.name as plan_name,
        plans.description,
        plans.price,
        plans.billing_interval,
        plans.stripe_price_lookup_key,
        plans.features_included,
        plans.texting_enabled,
        plans.monthly_text_limit,
        products.id as product_id,
        products.title as product_title,
        products.slug as product_slug,
        products.category as product_category
     from public.plans
     inner join public.products on products.id = plans.product_id
     where plans.is_active = true
       and products.published = true
       and products.status = 'active'
       and products.pricing_model = 'subscription'
     order by products.title asc, plans.sort_order asc, plans.price asc`
  );

  return result.rows.map((row) => mapPlanCatalogItem(row));
}

export async function getPublishedMarketingProducts() {
  await ensurePlansTable();

  const result = await db.query(
    `select
        products.id,
        products.title,
        products.slug,
        products.category,
        products.platform,
        products.short_description,
        products.pricing_model,
        min(
          case
            when plans.is_active = true and plans.billing_interval = 'monthly' then plans.price
            else null
          end
        ) as monthly_starting_price,
        count(plans.id) filter (where plans.is_active = true) as plan_count
     from public.products
     left join public.plans on plans.product_id = products.id
     where products.published = true
       and products.status = 'active'
     group by
       products.id,
       products.title,
       products.slug,
       products.category,
       products.platform,
       products.short_description,
       products.pricing_model
     order by
       case when products.pricing_model = 'subscription' then 0 else 1 end,
       coalesce(
         min(
           case
             when plans.is_active = true and plans.billing_interval = 'monthly' then plans.price
             else null
           end
         ),
         999999
       ) asc,
       products.title asc`
  );

  return result.rows.map((row) => mapMarketingProduct(row));
}
