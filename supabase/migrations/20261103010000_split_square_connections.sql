begin;

alter table public.square_connections
  add column if not exists plugin_id text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'square_connections_plugin_id_check'
      and conrelid = 'public.square_connections'::regclass
  ) then
    alter table public.square_connections
      add constraint square_connections_plugin_id_check
      check (
        plugin_id is null or plugin_id in (
          'square-calendar-sink',
          'square-time-card-manager'
        )
      );
  end if;
end
$$;

drop index if exists public.square_connections_customer_id_idx;

create unique index if not exists square_connections_customer_plugin_idx
  on public.square_connections(customer_id, plugin_id)
  where customer_id is not null and plugin_id is not null;

create unique index if not exists square_connections_legacy_customer_idx
  on public.square_connections(customer_id)
  where customer_id is not null and plugin_id is null;

commit;
