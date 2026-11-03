-- Payments section of the admin panel. Run after payments.sql and admin.sql,
-- in Supabase: SQL Editor > New query. Safe to run again.

-- Payments waiting for review first, then the ones reviewed in the last 30 days
create or replace function public.admin_payments() returns json
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then
    raise exception 'Not an admin';
  end if;
  return (select coalesce(json_agg(p order by p.status <> 'pending', p.created_at desc), '[]') from (
    select py.id, py.user_id, au.email, py.mock_id, m.title as mock_title,
           py.sender_name, py.receipt_path, py.status, py.created_at
    from public.payments py
    join auth.users au on au.id = py.user_id
    left join public.mocks m on m.id = py.mock_id
    where py.status = 'pending' or py.created_at > now() - interval '30 days'
  ) p);
end;
$$;

-- Approving gives the account the mock. Rejecting asks the buyer for a new receipt.
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
    insert into public.mock_access (user_id, mock_id) values (paid.user_id, paid.mock_id) on conflict do nothing;
  end if;
  -- Also needed when the account already had the mock, because then the access trigger doesn't run
  update public.payments set status = case when approve then 'approved' else 'rejected' end where id = payment;
end;
$$;

revoke all on function public.admin_payments() from public, anon;
revoke all on function public.admin_review_payment(uuid, boolean) from public, anon;
grant execute on function public.admin_payments() to authenticated;
grant execute on function public.admin_review_payment(uuid, boolean) to authenticated;

-- Admins can open the receipts
drop policy if exists "Admins read receipts" on storage.objects;
create policy "Admins read receipts" on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts' and public.is_admin());
