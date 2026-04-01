create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  color text not null default '#89afd7',
  avatar_emoji text,
  created_at timestamptz not null default now()
);

create table if not exists public.labels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  color text not null default '#f8d978',
  created_at timestamptz not null default now()
);

create table if not exists public.task_assignees (
  task_id uuid not null references public.tasks(id) on delete cascade,
  member_id uuid not null references public.team_members(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (task_id, member_id)
);

create table if not exists public.task_labels (
  task_id uuid not null references public.tasks(id) on delete cascade,
  label_id uuid not null references public.labels(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (task_id, label_id)
);

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.task_activity (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists team_members_user_id_idx on public.team_members(user_id);
create index if not exists labels_user_id_idx on public.labels(user_id);
create index if not exists task_assignees_user_id_idx on public.task_assignees(user_id);
create index if not exists task_labels_user_id_idx on public.task_labels(user_id);
create index if not exists task_comments_user_id_idx on public.task_comments(user_id);
create index if not exists task_activity_user_id_idx on public.task_activity(user_id);

alter table public.team_members enable row level security;
alter table public.labels enable row level security;
alter table public.task_assignees enable row level security;
alter table public.task_labels enable row level security;
alter table public.task_comments enable row level security;
alter table public.task_activity enable row level security;

drop policy if exists "team_members_select_own" on public.team_members;
create policy "team_members_select_own" on public.team_members for select using (auth.uid() = user_id);
drop policy if exists "team_members_insert_own" on public.team_members;
create policy "team_members_insert_own" on public.team_members for insert with check (auth.uid() = user_id);
drop policy if exists "team_members_update_own" on public.team_members;
create policy "team_members_update_own" on public.team_members for update using (auth.uid() = user_id);
drop policy if exists "team_members_delete_own" on public.team_members;
create policy "team_members_delete_own" on public.team_members for delete using (auth.uid() = user_id);

drop policy if exists "labels_select_own" on public.labels;
create policy "labels_select_own" on public.labels for select using (auth.uid() = user_id);
drop policy if exists "labels_insert_own" on public.labels;
create policy "labels_insert_own" on public.labels for insert with check (auth.uid() = user_id);
drop policy if exists "labels_update_own" on public.labels;
create policy "labels_update_own" on public.labels for update using (auth.uid() = user_id);
drop policy if exists "labels_delete_own" on public.labels;
create policy "labels_delete_own" on public.labels for delete using (auth.uid() = user_id);

drop policy if exists "task_assignees_select_own" on public.task_assignees;
create policy "task_assignees_select_own" on public.task_assignees for select using (auth.uid() = user_id);
drop policy if exists "task_assignees_insert_own" on public.task_assignees;
create policy "task_assignees_insert_own" on public.task_assignees for insert with check (auth.uid() = user_id);
drop policy if exists "task_assignees_delete_own" on public.task_assignees;
create policy "task_assignees_delete_own" on public.task_assignees for delete using (auth.uid() = user_id);

drop policy if exists "task_labels_select_own" on public.task_labels;
create policy "task_labels_select_own" on public.task_labels for select using (auth.uid() = user_id);
drop policy if exists "task_labels_insert_own" on public.task_labels;
create policy "task_labels_insert_own" on public.task_labels for insert with check (auth.uid() = user_id);
drop policy if exists "task_labels_delete_own" on public.task_labels;
create policy "task_labels_delete_own" on public.task_labels for delete using (auth.uid() = user_id);

drop policy if exists "task_comments_select_own" on public.task_comments;
create policy "task_comments_select_own" on public.task_comments for select using (auth.uid() = user_id);
drop policy if exists "task_comments_insert_own" on public.task_comments;
create policy "task_comments_insert_own" on public.task_comments for insert with check (auth.uid() = user_id);
drop policy if exists "task_comments_delete_own" on public.task_comments;
create policy "task_comments_delete_own" on public.task_comments for delete using (auth.uid() = user_id);

drop policy if exists "task_activity_select_own" on public.task_activity;
create policy "task_activity_select_own" on public.task_activity for select using (auth.uid() = user_id);
drop policy if exists "task_activity_insert_own" on public.task_activity;
create policy "task_activity_insert_own" on public.task_activity for insert with check (auth.uid() = user_id);
drop policy if exists "task_activity_delete_own" on public.task_activity;
create policy "task_activity_delete_own" on public.task_activity for delete using (auth.uid() = user_id);
