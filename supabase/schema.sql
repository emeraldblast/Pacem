-- Pacemock database. Paste into Supabase: SQL Editor > New query > Run.
-- Accounts live in Supabase's own auth.users table, so passwords are never stored here.

create table public.mocks (
  id text primary key,
  title text not null,
  minutes int not null,
  total int not null,
  is_public boolean not null default false,  -- true: every verified account can open it
  questions jsonb not null default '[]'
);

-- Who can open which private mock
create table public.mock_access (
  user_id uuid not null references auth.users on delete cascade,
  mock_id text not null references public.mocks on delete cascade,
  primary key (user_id, mock_id)
);

create table public.attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  mock_id text not null,  -- also the built-in mocks, which are not in the mocks table
  score int not null,
  answers jsonb not null default '{}',
  finished_at timestamptz not null default now()
);

alter table public.mocks enable row level security;
alter table public.mock_access enable row level security;
alter table public.attempts enable row level security;

-- Unverified emails never get a session, so "authenticated" means verified
create policy "Open public mocks and granted mocks" on public.mocks
  for select to authenticated
  using (
    is_public
    or exists (
      select 1 from public.mock_access a
      where a.mock_id = id and a.user_id = auth.uid()
    )
  );

create policy "See your own access" on public.mock_access
  for select to authenticated
  using (user_id = auth.uid());

create policy "See your own attempts" on public.attempts
  for select to authenticated
  using (user_id = auth.uid());

create policy "Save your own attempts" on public.attempts
  for insert to authenticated
  with check (user_id = auth.uid());

-- No insert or update policies on mocks or mock_access: only you, from the
-- Supabase dashboard, can add mocks or give access.
--
-- To give one person a mock, run this with their email and the mock's id:
--
--   insert into public.mock_access (user_id, mock_id)
--   select id, 'mock2' from auth.users where email = 'person@example.com';
