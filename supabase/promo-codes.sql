-- Promo codes for paid mocks, and the admin panel's Promo codes section.
-- Run after payments.sql, admin.sql and admin-payments.sql, in Supabase: SQL Editor > New query.
-- Safe to run again.
--
-- A code takes a percentage off the price. 100% makes the mock free: it unlocks straight away.
-- Codes are only read inside the functions below, so nobody can list them.

create table if not exists public.promo_codes (
  code text primary key check (code ~ '^[A-Z0-9_-]{3,32}$'),
  percent int not null check (percent between 1 and 100),
  max_uses int check (max_uses > 0),  -- empty: no limit
  uses int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.promo_codes enable row level security;
-- No policies: the table is only read inside the functions below.

alter table public.payments add column if not exists promo_code text references public.promo_codes on delete set null;
alter table public.payments add column if not exists discount int not null default 0;

-- A paid mock is sold whole: Mock 2 is math2 and crit2 together. Its parts are the private mocks
-- whose id ends in the same number.
create or replace function public.mock_parts(mock text) returns setof text
language sql stable security definer set search_path = public as $$
  select id from public.mocks
  where not is_public and substring(id from '\d+$') = substring(mock from '\d+$');
$$;

-- The percentage a code takes off, or null when it is unknown, switched off or used up
create or replace function public.promo_percent(promo text) returns int
language sql stable security definer set search_path = public as $$
  select percent from public.promo_codes
  where code = upper(trim(promo)) and active and (max_uses is null or uses < max_uses);
$$;

-- Sends a payment for a mock, with an optional promo code. The discount is worked out here,
-- so it can't be changed in the browser. Gives back 'approved' when a 100% code unlocked the mock,
-- otherwise 'pending'.
create or replace function public.send_payment(mock text, sender text, promo text default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  used_code text := nullif(upper(trim(promo)), '');
  pct int := 0;
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;
  if not exists (select 1 from public.mocks where id = mock and not is_public) then
    raise exception 'Unknown mock';
  end if;
  if used_code is not null then
    select percent into pct from public.promo_codes
    where code = used_code and active and (max_uses is null or uses < max_uses)
    for update;
    if not found then
      raise exception 'Promo code not valid';
    end if;
    update public.promo_codes set uses = uses + 1 where code = used_code;
  end if;

  if pct = 100 then
    insert into public.mock_access (user_id, mock_id)
    select auth.uid(), part from public.mock_parts(mock) part
    on conflict do nothing;
    insert into public.payments (user_id, mock_id, sender_name, receipt_path, status, promo_code, discount)
    values (auth.uid(), mock, 'Promo code', auth.uid()::text || '/no-receipt', 'approved', used_code, 100);
    return 'approved';
  end if;

  if char_length(trim(coalesce(sender, ''))) < 2 then
    raise exception 'Enter your Kaspi name';
  end if;
  insert into public.payments (user_id, mock_id, sender_name, receipt_path, promo_code, discount)
  values (auth.uid(), mock, trim(sender), auth.uid()::text || '/no-receipt', used_code, pct);
  return 'pending';
end;
$$;

-- Payments for the admin panel, now with the promo code and discount
create or replace function public.admin_payments() returns json
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then
    raise exception 'Not an admin';
  end if;
  return (select coalesce(json_agg(p order by p.status <> 'pending', p.created_at desc), '[]') from (
    select py.id, py.user_id, au.email, py.mock_id, m.title as mock_title,
           py.sender_name, py.receipt_path, py.status, py.created_at, py.promo_code, py.discount
    from public.payments py
    join auth.users au on au.id = py.user_id
    left join public.mocks m on m.id = py.mock_id
    where py.status = 'pending' or py.created_at > now() - interval '30 days'
  ) p);
end;
$$;

-- Approving now unlocks every part of the mock that was paid for, not just the first
create or replace function public.admin_review_payment(payment uuid, approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  paid public.payments;
begin
  if not public.is_admin() then
    raise exception 'Not an admin';
  end if;
  select * into paid from public.payments where id = payment;
  if not found then
    raise exception 'Payment not found';
  end if;
  if approve then
    insert into public.mock_access (user_id, mock_id)
    select paid.user_id, part from public.mock_parts(paid.mock_id) part
    on conflict do nothing;
  end if;
  -- Also needed when the account already had the mock, because then the access trigger doesn't run
  update public.payments set status = case when approve then 'approved' else 'rejected' end where id = payment;
end;
$$;

-- Every promo code, for the admin panel
create or replace function public.admin_promo_codes() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Not an admin';
  end if;
  return (select coalesce(json_agg(c order by c.created_at desc), '[]') from public.promo_codes c);
end;
$$;

-- Adds a code, or changes one with the same name
create or replace function public.admin_save_promo(promo text, pct int, use_limit int, is_active boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Not an admin';
  end if;
  insert into public.promo_codes (code, percent, max_uses, active)
  values (upper(trim(promo)), pct, use_limit, is_active)
  on conflict (code) do update set percent = excluded.percent, max_uses = excluded.max_uses, active = excluded.active;
end;
$$;

create or replace function public.admin_delete_promo(promo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Not an admin';
  end if;
  delete from public.promo_codes where code = upper(trim(promo));
end;
$$;

revoke all on function public.mock_parts(text) from public, anon, authenticated;
revoke all on function public.promo_percent(text) from public, anon;
revoke all on function public.send_payment(text, text, text) from public, anon;
revoke all on function public.admin_promo_codes() from public, anon;
revoke all on function public.admin_save_promo(text, int, int, boolean) from public, anon;
revoke all on function public.admin_delete_promo(text) from public, anon;
grant execute on function public.promo_percent(text) to authenticated;
grant execute on function public.send_payment(text, text, text) to authenticated;
grant execute on function public.admin_promo_codes() to authenticated;
grant execute on function public.admin_save_promo(text, int, int, boolean) to authenticated;
grant execute on function public.admin_delete_promo(text) to authenticated;
