-- Security lockdown.
-- * RLS enabled AND forced on every public table, with NO policies for anon or
--   authenticated: clients can never touch tables directly.
-- * All privileges revoked from anon/authenticated, now and by default for
--   future objects created by this role.
-- * service_role (BYPASSRLS) is granted explicitly so Next.js server routes work
--   regardless of the project's auto-expose setting.

do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  loop
    execute format('alter table public.%I enable row level security', t.relname);
    execute format('alter table public.%I force row level security', t.relname);
  end loop;
end
$$;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
-- Functions are executable by PUBLIC by default; close that too for future ones.
alter default privileges in schema public revoke execute on functions from public;

grant usage on schema public to service_role;
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;
alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on functions to service_role;

comment on table public.plays is
  'Append-only for clients (inserted via server routes only). Only service_role updates rows, e.g. Phase 2 finalisation.';
comment on table public.play_answers is
  'Append-only for clients (inserted via server routes only). Only service_role updates rows, e.g. Phase 2 finalisation.';
