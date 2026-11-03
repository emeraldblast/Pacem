-- Kaspi payments. Run in Supabase: SQL Editor > New query. Safe to run again.
-- A visitor uploads a receipt and sends a pending payment. You check the transfer in Kaspi,
-- then approve it, which opens every mock in the mocks table for that account:
--   update payments set status = 'approved' where id = '<payment id>';
-- Receipts are in Storage > receipts, in a folder named after the account id.

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  sender_name text not null check (char_length(sender_name) between 2 and 80),
  receipt_path text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

-- One payment waiting for review per account
create unique index if not exists payments_one_pending on public.payments (user_id) where status = 'pending';

alter table public.payments enable row level security;

drop policy if exists "Accounts read their own payments" on public.payments;
create policy "Accounts read their own payments" on public.payments
  for select to authenticated using (user_id = auth.uid());

-- Accounts can only send pending payments with their own receipt. Only the dashboard can approve.
drop policy if exists "Accounts send their own payments" on public.payments;
create policy "Accounts send their own payments" on public.payments
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and receipt_path like auth.uid()::text || '/%');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880,
        array['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do nothing;

drop policy if exists "Accounts upload receipts to their own folder" on storage.objects;
create policy "Accounts upload receipts to their own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

-- Adds to the existing mocks rules: an approved payment opens every mock
drop policy if exists "Paid accounts read mocks" on public.mocks;
create policy "Paid accounts read mocks" on public.mocks
  for select to authenticated
  using (exists (select 1 from public.payments where user_id = auth.uid() and status = 'approved'));
