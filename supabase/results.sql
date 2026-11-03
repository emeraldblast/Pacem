-- Lets finished results be saved for every mock, including the built-in ones
-- (Math Mock 1, Critical Thinking & PS Mock 1), which are not in the mocks table.
-- Run once in the SQL Editor.
alter table public.attempts drop constraint if exists attempts_mock_id_fkey;
