-- Upgrade installations that already applied the records migration under the
-- former name. Fresh installations already use the GPT identifiers.
do $$
begin
  if to_regclass('public.copilot_rate_limits') is not null then
    alter table public.copilot_rate_limits rename to gpt_rate_limits;
    alter table public.gpt_rate_limits rename constraint copilot_rate_limits_pkey to gpt_rate_limits_pkey;
    alter table public.gpt_rate_limits rename constraint copilot_rate_limits_user_id_fkey to gpt_rate_limits_user_id_fkey;
  end if;
  if to_regprocedure('public.consume_copilot_request()') is not null then
    alter function public.consume_copilot_request() rename to consume_gpt_request;
  end if;
end;
$$;

-- PL/pgSQL bodies retain textual table references when a table is renamed.
create or replace function public.consume_gpt_request()
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare used integer;
begin
  if (select public.current_user_role()) is distinct from 'instructor'::public.user_role then
    return false;
  end if;
  insert into public.gpt_rate_limits as limits (user_id, window_start, requests)
  values (auth.uid(), date_trunc('minute', clock_timestamp()), 1)
  on conflict (user_id) do update set
    requests = case when limits.window_start = excluded.window_start then limits.requests + 1 else 1 end,
    window_start = excluded.window_start
  returning requests into used;
  return used <= 10;
end;
$$;

revoke all on function public.consume_gpt_request() from public, anon;

grant execute on function public.consume_gpt_request() to authenticated;
