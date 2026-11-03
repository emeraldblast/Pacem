-- Admin panel (admin.html). Admins are listed in public.admins. Everything the panel does goes
-- through the functions below, which check that list first, so other accounts get nothing.

create table if not exists public.admins (
  user_id uuid primary key references auth.users on delete cascade
);
alter table public.admins enable row level security;
-- No policies: the table is only read inside the functions below.

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- Every account with its unlocked mocks and results, and every paid mock
create or replace function public.admin_overview() returns json
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then
    raise exception 'Not an admin';
  end if;
  return json_build_object(
    'mocks', (select coalesce(json_agg(json_build_object('id', m.id, 'title', m.title) order by m.id), '[]')
              from public.mocks m where not m.is_public),
    'users', (select coalesce(json_agg(u order by u.created_at desc), '[]') from (
      select au.id, au.email, au.created_at, au.last_sign_in_at,
             au.email_confirmed_at is not null as verified,
             coalesce((select json_agg(a.mock_id order by a.mock_id) from public.mock_access a where a.user_id = au.id), '[]') as unlocked,
             exists (select 1 from public.admins ad where ad.user_id = au.id) as admin,
             (select count(*) from public.attempts t where t.user_id = au.id) as finished,
             (select round(avg(t.score)) from public.attempts t where t.user_id = au.id) as average
      from auth.users au
    ) u)
  );
end;
$$;

-- Turns one paid mock on or off for one account
create or replace function public.admin_set_access(target uuid, mock text, allow boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Not an admin';
  end if;
  if allow then
    insert into public.mock_access (user_id, mock_id) values (target, mock) on conflict do nothing;
  else
    delete from public.mock_access where user_id = target and mock_id = mock;
  end if;
end;
$$;

-- Makes an account an admin, or takes that away. Admins can't remove themselves,
-- so there is always at least one admin left.
create or replace function public.admin_set_admin(target uuid, make boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Not an admin';
  end if;
  if make then
    if not exists (select 1 from auth.users where id = target and email_confirmed_at is not null) then
      raise exception 'Only verified accounts can be admins';
    end if;
    insert into public.admins (user_id) values (target) on conflict do nothing;
  else
    if target = auth.uid() then
      raise exception 'You can''t remove yourself as an admin';
    end if;
    delete from public.admins where user_id = target;
  end if;
end;
$$;

revoke all on function public.is_admin() from public, anon;
revoke all on function public.admin_set_admin(uuid, boolean) from public, anon;
grant execute on function public.admin_set_admin(uuid, boolean) to authenticated;
revoke all on function public.admin_overview() from public, anon;
revoke all on function public.admin_set_access(uuid, text, boolean) from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.admin_overview() to authenticated;
grant execute on function public.admin_set_access(uuid, text, boolean) to authenticated;

-- The first admin. More are added from the Admin column in the panel.
insert into public.admins (user_id)
select id from auth.users where email = 'smazanovm@gmail.com'
on conflict do nothing;
