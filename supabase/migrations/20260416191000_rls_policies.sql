create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.app_admins
    where user_id = auth.uid()::text
  );
$$;

alter table public.customer_profiles enable row level security;
alter table public.app_admins enable row level security;
alter table public.products enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.reviews enable row level security;
alter table public.demos enable row level security;
alter table public.leads enable row level security;
alter table public.payment_methods enable row level security;
alter table public.invoices enable row level security;
alter table public.product_media enable row level security;

drop policy if exists "admins can view app_admins" on public.app_admins;
create policy "admins can view app_admins"
on public.app_admins
for select
using (public.is_admin());

drop policy if exists "public can view published products" on public.products;
create policy "public can view published products"
on public.products
for select
using (published = true and status = 'active');

drop policy if exists "admins can manage products" on public.products;
create policy "admins can manage products"
on public.products
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "public can view active plans for published products" on public.plans;
create policy "public can view active plans for published products"
on public.plans
for select
using (
  is_active = true
  and exists (
    select 1
    from public.products
    where products.id = plans.product_id
      and products.published = true
      and products.status = 'active'
  )
);

drop policy if exists "admins can manage plans" on public.plans;
create policy "admins can manage plans"
on public.plans
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "public can view approved reviews" on public.reviews;
create policy "public can view approved reviews"
on public.reviews
for select
using (
  is_approved = true
  and exists (
    select 1
    from public.products
    where products.id = reviews.product_id
      and products.published = true
      and products.status = 'active'
  )
);

drop policy if exists "admins can manage reviews" on public.reviews;
create policy "admins can manage reviews"
on public.reviews
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "public can view public demos" on public.demos;
create policy "public can view public demos"
on public.demos
for select
using (
  is_public = true
  and exists (
    select 1
    from public.products
    where products.id = demos.product_id
      and products.published = true
      and products.status = 'active'
  )
);

drop policy if exists "admins can manage demos" on public.demos;
create policy "admins can manage demos"
on public.demos
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "public can view product media for published products" on public.product_media;
create policy "public can view product media for published products"
on public.product_media
for select
using (
  exists (
    select 1
    from public.products
    where products.id = product_media.product_id
      and products.published = true
      and products.status = 'active'
  )
);

drop policy if exists "admins can manage product media" on public.product_media;
create policy "admins can manage product media"
on public.product_media
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "public can submit leads" on public.leads;
create policy "public can submit leads"
on public.leads
for insert
with check (true);

drop policy if exists "admins can manage leads" on public.leads;
create policy "admins can manage leads"
on public.leads
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "customers can view own profile" on public.customer_profiles;
create policy "customers can view own profile"
on public.customer_profiles
for select
using (user_id = auth.uid()::text);

drop policy if exists "customers can update own profile" on public.customer_profiles;
create policy "customers can update own profile"
on public.customer_profiles
for update
using (user_id = auth.uid()::text)
with check (user_id = auth.uid()::text);

drop policy if exists "admins can manage customer profiles" on public.customer_profiles;
create policy "admins can manage customer profiles"
on public.customer_profiles
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "customers can view own subscriptions" on public.subscriptions;
create policy "customers can view own subscriptions"
on public.subscriptions
for select
using (
  exists (
    select 1
    from public.customer_profiles
    where customer_profiles.id = subscriptions.customer_id
      and customer_profiles.user_id = auth.uid()::text
  )
);

drop policy if exists "admins can manage subscriptions" on public.subscriptions;
create policy "admins can manage subscriptions"
on public.subscriptions
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "customers can view own payment methods" on public.payment_methods;
create policy "customers can view own payment methods"
on public.payment_methods
for select
using (
  exists (
    select 1
    from public.customer_profiles
    where customer_profiles.id = payment_methods.customer_id
      and customer_profiles.user_id = auth.uid()::text
  )
);

drop policy if exists "admins can manage payment methods" on public.payment_methods;
create policy "admins can manage payment methods"
on public.payment_methods
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "customers can view own invoices" on public.invoices;
create policy "customers can view own invoices"
on public.invoices
for select
using (
  exists (
    select 1
    from public.customer_profiles
    where customer_profiles.id = invoices.customer_id
      and customer_profiles.user_id = auth.uid()::text
  )
);

drop policy if exists "admins can manage invoices" on public.invoices;
create policy "admins can manage invoices"
on public.invoices
for all
using (public.is_admin())
with check (public.is_admin());
