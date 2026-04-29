create extension if not exists pgcrypto;

create type public.product_category as enum (
  'square_plugin',
  'mobile_app_development',
  'consulting',
  'custom_development'
);

create type public.pricing_model as enum (
  'subscription',
  'one_time',
  'custom_quote'
);

create type public.product_status as enum (
  'draft',
  'active',
  'coming_soon',
  'retired'
);

create type public.billing_interval as enum (
  'monthly',
  'yearly',
  'one_time',
  'custom'
);

create type public.customer_status as enum (
  'active',
  'inactive',
  'suspended'
);

create type public.subscription_status as enum (
  'active',
  'trialing',
  'past_due',
  'canceled',
  'expired'
);

create type public.billing_status as enum (
  'current',
  'past_due',
  'unpaid',
  'canceled'
);

create type public.lead_status as enum (
  'new',
  'contacted',
  'qualified',
  'closed',
  'archived'
);

create type public.demo_type as enum (
  'video',
  'image_gallery',
  'external_link',
  'interactive'
);

create type public.invoice_status as enum (
  'draft',
  'open',
  'paid',
  'void',
  'uncollectible'
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.customer_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique,
  email text not null unique,
  company_name text,
  contact_name text,
  phone text,
  status public.customer_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_admins (
  user_id text primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  category public.product_category not null,
  platform text,
  short_description text,
  full_description text,
  use_cases text[] not null default '{}',
  feature_list text[] not null default '{}',
  pricing_model public.pricing_model not null,
  base_price numeric(10,2),
  cta_type text,
  status public.product_status not null default 'draft',
  hero_media_url text,
  demo_available boolean not null default false,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  description text,
  price numeric(10,2) not null,
  billing_interval public.billing_interval not null,
  features_included text[] not null default '{}',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  plan_id uuid references public.plans(id) on delete set null,
  status public.subscription_status not null default 'active',
  billing_status public.billing_status not null default 'current',
  start_date timestamptz not null default now(),
  renewal_date timestamptz,
  canceled_at timestamptz,
  auto_renew boolean not null default true,
  custom_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  reviewer_name text not null,
  reviewer_company text,
  rating integer check (rating between 1 and 5),
  quote text not null,
  is_approved boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.demos (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  title text not null,
  description text,
  demo_type public.demo_type not null,
  media_url text not null,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  company text,
  interest_type text,
  product_id uuid references public.products(id) on delete set null,
  message text,
  status public.lead_status not null default 'new',
  created_at timestamptz not null default now()
);

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(id) on delete cascade,
  provider text not null,
  provider_payment_method_id text not null unique,
  brand text,
  last4 text,
  exp_month integer,
  exp_year integer,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  amount numeric(10,2) not null,
  currency text not null default 'USD',
  status public.invoice_status not null default 'open',
  provider_invoice_id text unique,
  invoice_date timestamptz not null default now(),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.product_media (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  media_url text not null,
  alt_text text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_plans_product_id on public.plans(product_id);
create index if not exists idx_subscriptions_customer_id on public.subscriptions(customer_id);
create index if not exists idx_subscriptions_product_id on public.subscriptions(product_id);
create index if not exists idx_reviews_product_id on public.reviews(product_id);
create index if not exists idx_demos_product_id on public.demos(product_id);
create index if not exists idx_leads_product_id on public.leads(product_id);
create index if not exists idx_invoices_customer_id on public.invoices(customer_id);
create index if not exists idx_payment_methods_customer_id on public.payment_methods(customer_id);
create index if not exists idx_product_media_product_id on public.product_media(product_id);

create unique index if not exists one_default_payment_method_per_customer
on public.payment_methods(customer_id)
where is_default = true;

drop trigger if exists set_customer_profiles_updated_at on public.customer_profiles;
create trigger set_customer_profiles_updated_at
before update on public.customer_profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_products_updated_at on public.products;
create trigger set_products_updated_at
before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists set_plans_updated_at on public.plans;
create trigger set_plans_updated_at
before update on public.plans
for each row execute function public.set_updated_at();

drop trigger if exists set_subscriptions_updated_at on public.subscriptions;
create trigger set_subscriptions_updated_at
before update on public.subscriptions
for each row execute function public.set_updated_at();
