-- Security fix for my_credit_account() (credit_checkout, 20261113120000).
-- It runs as SECURITY DEFINER without a fixed search_path, which Supabase's
-- security advisor flags: a caller could otherwise steer which objects it
-- resolves. Its body already uses fully qualified names (public.credit_accounts,
-- auth.uid()), so locking the path changes nothing about what it returns.
-- If the function is ever redefined, keep `set search_path = ''` in it.
-- The function is not created by any migration (it exists only where it was
-- made by hand), so skip quietly on a fresh database instead of failing.
do $$
begin
  if to_regprocedure('public.my_credit_account()') is not null then
    alter function public.my_credit_account() set search_path = '';
  end if;
end
$$;
