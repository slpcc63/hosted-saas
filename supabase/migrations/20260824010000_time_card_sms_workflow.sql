create table if not exists public.time_card_sms_messages (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customer_profiles(id) on delete cascade,
  employee_id uuid references public.time_card_employee_contacts(id) on delete set null,
  request_id uuid references public.time_card_confirmation_requests(id) on delete set null,
  twilio_message_sid text not null unique,
  direction text not null check (direction in ('inbound', 'outbound')),
  from_phone text,
  to_phone text,
  body text not null default '',
  status text not null,
  processing_result text,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists time_card_sms_request_idx
  on public.time_card_sms_messages(request_id, created_at desc);
create index if not exists time_card_sms_employee_idx
  on public.time_card_sms_messages(employee_id, created_at desc);

alter table public.time_card_sms_messages enable row level security;

