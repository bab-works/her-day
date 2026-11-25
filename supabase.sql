-- her-day 서버 준비 (Supabase → SQL Editor에 붙여넣고 Run, 한 번만)
-- 사람마다 한 줄: 기록 전체(data). RLS로 로그인한 본인 줄만 읽고 쓸 수 있음 (앱을 만든 사람도 앱으로는 못 봄)
create table if not exists public.herday (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.herday enable row level security;
revoke all on public.herday from anon;
grant select, insert, update, delete on public.herday to authenticated;
drop policy if exists "own read" on public.herday;
drop policy if exists "own insert" on public.herday;
drop policy if exists "own update" on public.herday;
drop policy if exists "own delete" on public.herday;
create policy "own read" on public.herday for select to authenticated using ((select auth.uid()) = user_id);
create policy "own insert" on public.herday for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own update" on public.herday for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own delete" on public.herday for delete to authenticated using ((select auth.uid()) = user_id);
