create extension if not exists pgcrypto;

create table if not exists public.time_card_employee_contacts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(id) on delete cascade,
  square_team_member_id text not null,
  display_name text not null,
  email text,
  timezone text not null default 'America/Los_Angeles',
  active boolean not null default true,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, square_team_member_id)
);

create table if not exists public.time_card_confirmation_settings (
  customer_id uuid primary key references public.customer_profiles(id) on delete cascade,
  automation_enabled boolean not null default false,
  send_day_of_week integer not null default 1 check (send_day_of_week between 0 and 6),
  send_time_local text not null default '09:00',
  timezone text not null default 'America/Los_Angeles',
  period_days integer not null default 7 check (period_days between 1 and 31),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.time_card_confirmation_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(id) on delete cascade,
  employee_id uuid not null references public.time_card_employee_contacts(id) on delete restrict,
  square_team_member_id text not null,
  employee_name text not null,
  employee_email text not null,
  period_start date not null,
  period_end date not null,
  timezone text not null,
  status text not null default 'pending'
    check (status in ('delivery_failed', 'pending', 'responded', 'approved', 'rejected')),
  response_token_hash text not null unique,
  token_expires_at timestamptz not null,
  response_code text check (response_code in ('a', 'b')),
  reported_shift_date date,
  reported_time_in text,
  reported_time_out text,
  response_note text,
  manager_note text,
  sent_at timestamptz,
  responded_at timestamptz,
  reviewed_at timestamptz,
  approved_at timestamptz,
  reviewed_by_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start),
  unique (employee_id, period_start, period_end)
);

create table if not exists public.time_card_confirmation_audit_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.time_card_confirmation_requests(id) on delete cascade,
  customer_id uuid not null references public.customer_profiles(id) on delete cascade,
  event_type text not null,
  actor_type text not null check (actor_type in ('system', 'employee', 'manager')),
  actor_identifier text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists time_card_contacts_customer_idx
  on public.time_card_employee_contacts(customer_id, active, display_name);
create index if not exists time_card_requests_customer_status_idx
  on public.time_card_confirmation_requests(customer_id, status, created_at desc);
create index if not exists time_card_requests_employee_idx
  on public.time_card_confirmation_requests(employee_id, created_at desc);
create unique index if not exists time_card_requests_employee_period_idx
  on public.time_card_confirmation_requests(employee_id, period_start, period_end);
create index if not exists time_card_audit_request_idx
  on public.time_card_confirmation_audit_events(request_id, created_at);

alter table public.time_card_employee_contacts enable row level security;
alter table public.time_card_confirmation_settings enable row level security;
alter table public.time_card_confirmation_requests enable row level security;
alter table public.time_card_confirmation_audit_events enable row level security;

-- The deployed application uses Better Auth with a server-owned Neon connection,
-- not Supabase Auth. With RLS enabled and no public policies, non-owner database
-- roles are denied by default; customer ownership is enforced by authenticated
-- server actions and customer-scoped queries.
