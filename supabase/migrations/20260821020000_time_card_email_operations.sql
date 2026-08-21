alter table public.time_card_confirmation_requests
  add column if not exists reminder_count integer not null default 0;

alter table public.time_card_confirmation_requests
  add column if not exists last_reminder_at timestamptz;

create table if not exists public.time_card_confirmation_runs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  status text not null default 'running',
  sent_count integer not null default 0,
  skipped_count integer not null default 0,
  failed_count integer not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (customer_id, period_start, period_end)
);

create index if not exists time_card_confirmation_runs_customer_idx
  on public.time_card_confirmation_runs(customer_id, created_at desc);

alter table public.time_card_confirmation_runs enable row level security;
