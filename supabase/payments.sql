-- Kaspi payments for exclusive mocks. Run in Supabase: SQL Editor > New query. Safe to run again.
-- A buyer uploads a receipt and sends a pending payment for one mock. Check the transfer in Kaspi,
-- then unlock the mock with the Telegram bot (/unlock email math2). That marks the payment approved.
--
-- Payments waiting for review, with the buyer's email:
--   select p.created_at, u.email, p.mock_id, p.sender_name, p.receipt_path
--   from payments p join auth.users u on u.id = p.user_id
--   where p.status = 'pending' order by p.created_at;
--
-- Receipts are in Storage > receipts, in a folder named after the account id.
-- To turn a payment down, so the buyer is asked for a new receipt:
--   update payments set status = 'rejected' where id = '<payment id>';

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  mock_id text not null references public.mocks on delete cascade,
  sender_name text not null check (char_length(sender_name) between 2 and 80),
  receipt_path text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

-- One payment waiting for review per account and mock
create unique index if not exists payments_one_pending on public.payments (user_id, mock_id) where status = 'pending';

alter table public.payments enable row level security;

drop policy if exists "See your own payments" on public.payments;
create policy "See your own payments" on public.payments
  for select to authenticated using (user_id = auth.uid());

-- Accounts can only send pending payments with their own receipt. Only you can approve them.
drop policy if exists "Send your own payments" on public.payments;
create policy "Send your own payments" on public.payments
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and receipt_path like auth.uid()::text || '/%');

-- Giving an account a mock, with the bot or by hand, approves the payments waiting for it
create or replace function public.approve_paid_mock() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.payments set status = 'approved'
  where user_id = new.user_id and mock_id = new.mock_id and status = 'pending';
  return new;
end $$;

drop trigger if exists approve_paid_mock on public.mock_access;
create trigger approve_paid_mock after insert on public.mock_access
  for each row execute function public.approve_paid_mock();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880,
        array['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do nothing;

drop policy if exists "Upload receipts to your own folder" on storage.objects;
create policy "Upload receipts to your own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
