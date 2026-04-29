import "server-only";

import { db } from "@/lib/db";
import { ensureCustomerProfilesTable } from "@/lib/customers";
import { ensurePlansTable, ensureProductsTable } from "@/lib/products";

export type CustomerSubscription = {
  id: string;
  customSettings: Record<string, unknown>;
  customerId: string;
  productId: string;
  productSlug: string;
  planId: string | null;
  productTitle: string;
  productCategory: string;
  planName: string | null;
  status: string;
  billingStatus: string;
  renewalDate: Date | null;
  autoRenew: boolean;
  stripeSubscriptionId: string | null;
  createdAt: Date;
};

export type CreateSubscriptionInput = {
  customSettings?: Record<string, unknown>;
  customerId: string;
  planId: string;
};

export type ChangeSubscriptionPlanInput = {
  customerId: string;
  planId: string;
  subscriptionId: string;
};

export type CancelSubscriptionInput = {
  customerId: string;
  subscriptionId: string;
};

export type UpdateSubscriptionCustomSettingsInput = {
  customerId: string;
  customSettings: Record<string, unknown>;
  subscriptionId: string;
};

export type ActiveProductSubscription = CustomerSubscription & {
  monthlyTextLimit: number;
  productSlug: string;
  textingEnabled: boolean;
};

let subscriptionsTableReady: Promise<void> | null = null;

function mapCustomerSubscription(row: Record<string, unknown>): CustomerSubscription {
  return {
    id: String(row.id),
    customSettings:
      row.custom_settings && typeof row.custom_settings === "object" && !Array.isArray(row.custom_settings)
        ? (row.custom_settings as Record<string, unknown>)
        : {},
    customerId: String(row.customer_id),
    productId: String(row.product_id),
    productSlug: String(row.product_slug),
    planId: row.plan_id ? String(row.plan_id) : null,
    productTitle: String(row.product_title),
    productCategory: String(row.product_category),
    planName: row.plan_name ? String(row.plan_name) : null,
    status: String(row.status),
    billingStatus: String(row.billing_status),
    renewalDate: row.renewal_date ? new Date(String(row.renewal_date)) : null,
    autoRenew: Boolean(row.auto_renew),
    stripeSubscriptionId: row.stripe_subscription_id ? String(row.stripe_subscription_id) : null,
    createdAt: new Date(String(row.created_at))
  };
}

export async function ensureSubscriptionsTable() {
  await ensureCustomerProfilesTable();
  await ensureProductsTable();
  await ensurePlansTable();

  if (!subscriptionsTableReady) {
    subscriptionsTableReady = db.query(`
      create extension if not exists pgcrypto;

      create table if not exists public.subscriptions (
        id uuid primary key default gen_random_uuid(),
        customer_id uuid not null references public.customer_profiles(id) on delete cascade,
        product_id uuid not null references public.products(id) on delete restrict,
        plan_id uuid references public.plans(id) on delete set null,
        stripe_subscription_id text unique,
        status text not null default 'active',
        billing_status text not null default 'current',
        start_date timestamptz not null default now(),
        renewal_date timestamptz,
        canceled_at timestamptz,
        auto_renew boolean not null default true,
        custom_settings jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      alter table public.subscriptions
        add column if not exists stripe_subscription_id text unique;
    `).then(() => undefined);
  }

  return subscriptionsTableReady;
}

export async function getSubscriptionsForCustomer(customerId: string) {
  await ensureSubscriptionsTable();

  const result = await db.query(
    `select
        subscriptions.id,
        subscriptions.custom_settings,
        subscriptions.customer_id,
        subscriptions.product_id,
        subscriptions.plan_id,
        subscriptions.status,
        subscriptions.billing_status,
        subscriptions.renewal_date,
        subscriptions.auto_renew,
        subscriptions.stripe_subscription_id,
        subscriptions.created_at,
        products.title as product_title,
        products.slug as product_slug,
        products.category as product_category,
        plans.name as plan_name
     from public.subscriptions
     inner join public.products on products.id = subscriptions.product_id
     left join public.plans on plans.id = subscriptions.plan_id
     where subscriptions.customer_id = $1
     order by subscriptions.created_at desc`,
    [customerId]
  );

  return result.rows.map((row) => mapCustomerSubscription(row));
}

export async function createSubscriptionForCustomer(input: CreateSubscriptionInput) {
  await ensureSubscriptionsTable();

  const planResult = await db.query(
    `select id, product_id
     from public.plans
     where id = $1 and is_active = true
     limit 1`,
    [input.planId]
  );

  const plan = planResult.rows[0];

  if (!plan) {
    throw new Error("Plan not found");
  }

  const existingResult = await db.query(
    `select id
     from public.subscriptions
     where customer_id = $1
       and product_id = $2
       and status in ('active', 'trialing', 'past_due')
     limit 1`,
    [input.customerId, plan.product_id]
  );

  if (existingResult.rows[0]) {
    return String(existingResult.rows[0].id);
  }

  const result = await db.query(
    `insert into public.subscriptions (
      customer_id,
      product_id,
      plan_id,
      custom_settings,
      status,
      billing_status,
      renewal_date,
      auto_renew,
      updated_at
    ) values ($1, $2, $3, $4::jsonb, 'active', 'current', now() + interval '30 days', true, now())
    returning id`,
    [
      input.customerId,
      plan.product_id,
      input.planId,
      JSON.stringify(input.customSettings ?? {})
    ]
  );

  return String(result.rows[0].id);
}

export async function upsertStripeSubscriptionForCustomer(input: {
  customerId: string;
  planId: string;
  stripeSubscriptionId: string;
}) {
  await ensureSubscriptionsTable();

  const planResult = await db.query(
    `select id, product_id
     from public.plans
     where id = $1
     limit 1`,
    [input.planId]
  );

  const plan = planResult.rows[0];

  if (!plan) {
    throw new Error("Plan not found");
  }

  const existingByStripe = await db.query(
    `select id
     from public.subscriptions
     where stripe_subscription_id = $1
     limit 1`,
    [input.stripeSubscriptionId]
  );

  if (existingByStripe.rows[0]) {
    await db.query(
      `update public.subscriptions
       set customer_id = $2,
           product_id = $3,
           plan_id = $4,
           status = 'active',
           billing_status = 'current',
           auto_renew = true,
           renewal_date = now() + interval '30 days',
           updated_at = now()
       where id = $1`,
      [
        existingByStripe.rows[0].id,
        input.customerId,
        plan.product_id,
        input.planId
      ]
    );

    return String(existingByStripe.rows[0].id);
  }

  const existingLocal = await db.query(
    `select id
     from public.subscriptions
     where customer_id = $1
       and product_id = $2
     order by created_at desc
     limit 1`,
    [input.customerId, plan.product_id]
  );

  if (existingLocal.rows[0]) {
    await db.query(
      `update public.subscriptions
       set plan_id = $2,
           stripe_subscription_id = $3,
           status = 'active',
           billing_status = 'current',
           auto_renew = true,
           renewal_date = now() + interval '30 days',
           updated_at = now()
       where id = $1`,
      [
        existingLocal.rows[0].id,
        input.planId,
        input.stripeSubscriptionId
      ]
    );

    return String(existingLocal.rows[0].id);
  }

  const created = await db.query(
    `insert into public.subscriptions (
      customer_id,
      product_id,
      plan_id,
      stripe_subscription_id,
      status,
      billing_status,
      renewal_date,
      auto_renew,
      updated_at
    ) values ($1, $2, $3, $4, 'active', 'current', now() + interval '30 days', true, now())
    returning id`,
    [
      input.customerId,
      plan.product_id,
      input.planId,
      input.stripeSubscriptionId
    ]
  );

  return String(created.rows[0].id);
}

export async function changeSubscriptionPlanForCustomer(input: ChangeSubscriptionPlanInput) {
  await ensureSubscriptionsTable();

  const subscriptionResult = await db.query(
    `select id, customer_id, product_id
     from public.subscriptions
     where id = $1 and customer_id = $2
     limit 1`,
    [input.subscriptionId, input.customerId]
  );

  const subscription = subscriptionResult.rows[0];

  if (!subscription) {
    throw new Error("Subscription not found");
  }

  const planResult = await db.query(
    `select id, product_id
     from public.plans
     where id = $1 and is_active = true
     limit 1`,
    [input.planId]
  );

  const plan = planResult.rows[0];

  if (!plan || String(plan.product_id) !== String(subscription.product_id)) {
    throw new Error("Plan not available for this subscription");
  }

  await db.query(
    `update public.subscriptions
     set plan_id = $2,
         updated_at = now(),
         renewal_date = now() + interval '30 days'
     where id = $1`,
    [input.subscriptionId, input.planId]
  );
}

export async function cancelSubscriptionForCustomer(input: CancelSubscriptionInput) {
  await ensureSubscriptionsTable();

  const result = await db.query(
    `update public.subscriptions
     set status = 'canceled',
         billing_status = 'canceled',
         auto_renew = false,
         canceled_at = now(),
         updated_at = now()
     where id = $1
       and customer_id = $2
       and status in ('active', 'trialing', 'past_due')
     returning id`,
    [input.subscriptionId, input.customerId]
  );

  if (!result.rows[0]) {
    throw new Error("Subscription not found");
  }
}

export async function updateSubscriptionCustomSettings(
  input: UpdateSubscriptionCustomSettingsInput
) {
  await ensureSubscriptionsTable();

  const existing = await db.query(
    `select custom_settings
     from public.subscriptions
     where id = $1
       and customer_id = $2
     limit 1`,
    [input.subscriptionId, input.customerId]
  );

  if (!existing.rows[0]) {
    throw new Error("Subscription not found");
  }

  const currentSettings =
    existing.rows[0].custom_settings &&
    typeof existing.rows[0].custom_settings === "object" &&
    !Array.isArray(existing.rows[0].custom_settings)
      ? (existing.rows[0].custom_settings as Record<string, unknown>)
      : {};

  const mergedSettings = {
    ...currentSettings,
    ...input.customSettings
  };

  await db.query(
    `update public.subscriptions
     set custom_settings = $3::jsonb,
         updated_at = now()
     where id = $1
       and customer_id = $2`,
    [input.subscriptionId, input.customerId, JSON.stringify(mergedSettings)]
  );
}

function mapActiveProductSubscription(row: Record<string, unknown>): ActiveProductSubscription {
  const subscription = mapCustomerSubscription(row);

  return {
    ...subscription,
    productSlug: String(row.product_slug),
    textingEnabled: Boolean(row.texting_enabled),
    monthlyTextLimit: Number(row.monthly_text_limit ?? 0)
  };
}

export async function getActiveSubscriptionForProduct(input: {
  customerId: string;
  productSlug: string;
}) {
  await ensureSubscriptionsTable();

  const result = await db.query(
    `select
        subscriptions.id,
        subscriptions.custom_settings,
        subscriptions.customer_id,
        subscriptions.product_id,
        subscriptions.plan_id,
        subscriptions.status,
        subscriptions.billing_status,
        subscriptions.renewal_date,
        subscriptions.auto_renew,
        subscriptions.stripe_subscription_id,
        subscriptions.created_at,
        products.title as product_title,
        products.slug as product_slug,
        products.category as product_category,
        plans.name as plan_name,
        plans.texting_enabled,
        plans.monthly_text_limit
     from public.subscriptions
     inner join public.products on products.id = subscriptions.product_id
     left join public.plans on plans.id = subscriptions.plan_id
     where subscriptions.customer_id = $1
       and products.slug = $2
       and subscriptions.status in ('active', 'trialing', 'past_due')
     order by subscriptions.created_at desc
     limit 1`,
    [input.customerId, input.productSlug]
  );

  if (!result.rows[0]) {
    return null;
  }

  return mapActiveProductSubscription(result.rows[0]);
}
