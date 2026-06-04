-- CareerPilot: Job Hunter persistence layer.
--
-- Two tables:
--   hunter_hunts  — latest search per user, cached for 30 minutes
--   hunter_saved  — bookmarks, with optional link into the application tracker
--
-- Same auth model as the chat history migration: service-role client in
-- the API enforces user_id; RLS deny-all as defence-in-depth.

create table if not exists public.hunter_hunts (
  id           uuid primary key default gen_random_uuid(),
  user_id      text not null,
  -- The raw natural-language query the user typed.
  query        text not null,
  -- The full structured response (jobs + reasoning). Big JSONB blob.
  result       jsonb not null,
  -- Hash of the normalised query so we can detect "same search" cheaply.
  query_hash   text not null,
  -- When the result was last refreshed by the agent.
  refreshed_at timestamptz not null default now(),
  -- When the cache should be considered stale (default 30 min).
  expires_at   timestamptz not null default (now() + interval '30 minutes'),
  created_at   timestamptz not null default now()
);

create index if not exists hunter_hunts_user_query_idx
  on public.hunter_hunts (user_id, query_hash);

create index if not exists hunter_hunts_user_recent_idx
  on public.hunter_hunts (user_id, refreshed_at desc);

create table if not exists public.hunter_saved (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null,
  -- A normalised job descriptor; UNIQUE on (user_id, url) so re-saving is idempotent.
  url        text not null,
  title      text not null,
  company    text not null,
  location   text,
  salary     text,
  deadline   text,
  job_type   text,
  snippet    text,
  fit_score  integer,
  fit_reason text,
  -- Optional link to a row in the application tracker (applications table
  -- will be created by a separate migration; nullable for now).
  saved_at   timestamptz not null default now(),

  unique (user_id, url)
);

create index if not exists hunter_saved_user_idx
  on public.hunter_saved (user_id, saved_at desc);

-- ---------- RLS (deny-all to anon; service-role bypasses) ----------

alter table public.hunter_hunts enable row level security;
alter table public.hunter_saved enable row level security;

drop policy if exists hunter_hunts_deny_all  on public.hunter_hunts;
create policy hunter_hunts_deny_all  on public.hunter_hunts
  for all using (false) with check (false);

drop policy if exists hunter_saved_deny_all on public.hunter_saved;
create policy hunter_saved_deny_all on public.hunter_saved
  for all using (false) with check (false);
