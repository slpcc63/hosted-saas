alter table public.time_card_confirmation_settings
  add column if not exists manager_reminder_enabled boolean not null default true;

alter table public.time_card_confirmation_settings
  add column if not exists manager_reminder_time_local text not null default '15:00';

alter table public.time_card_confirmation_runs
  add column if not exists manager_reminder_sent_at timestamptz;
