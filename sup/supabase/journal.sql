-- Run once in the Supabase SQL Editor. No service key is used by the website.
begin;

create table if not exists public.sup_journals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null check (revision > 0),
  trips jsonb not null check (jsonb_typeof(trips) = 'array' and jsonb_array_length(trips) <= 500),
  updated_at timestamptz not null default now()
);

alter table public.sup_journals enable row level security;
revoke all on public.sup_journals from public, anon, authenticated;
grant select on public.sup_journals to authenticated;
drop policy if exists sup_journal_owner_read on public.sup_journals;
create policy sup_journal_owner_read on public.sup_journals for select to authenticated
  using ((select auth.uid()) = user_id);

-- Only this function may write. Its owner is the SQL Editor's database role,
-- but the destination is always auth.uid(), never an ID supplied by a caller.
create or replace function public.sup_save_journal(expected_revision bigint, new_trips jsonb)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  next_revision bigint;
begin
  if owner_id is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  if expected_revision is null or expected_revision < 0
     or new_trips is null or pg_catalog.jsonb_typeof(new_trips) <> 'array' then
    raise exception 'Invalid journal' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_array_length(new_trips) > 500 or pg_catalog.octet_length(new_trips::text) > 20000000 then
    raise exception 'Journal too large' using errcode = '22023';
  end if;
  if exists (select 1 from pg_catalog.jsonb_array_elements(new_trips) t
    where pg_catalog.jsonb_typeof(t) <> 'object'
      or pg_catalog.jsonb_typeof(t->'id') is distinct from 'string'
      or pg_catalog.length(t->>'id') not between 1 and 200)
    or (select count(*) <> count(distinct t->>'id') from pg_catalog.jsonb_array_elements(new_trips) t) then
    raise exception 'Invalid trip IDs' using errcode = '22023';
  end if;
  if expected_revision = 0 then
    insert into public.sup_journals (user_id, revision, trips)
      values (owner_id, 1, new_trips)
      on conflict (user_id) do nothing returning revision into next_revision;
  else
    update public.sup_journals set trips = new_trips, revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
      where user_id = owner_id and revision = expected_revision
      returning revision into next_revision;
  end if;
  if next_revision is null then
    raise exception 'Journal changed on another device' using errcode = '40001';
  end if;
  return next_revision;
end;
$$;

revoke all on function public.sup_save_journal(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.sup_save_journal(bigint, jsonb) to authenticated;
commit;
