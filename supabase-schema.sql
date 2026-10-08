-- Run this once in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'member' check (role in ('member','staff','admin')),
  created_at timestamptz not null default now()
);
create table if not exists public.notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default '堂會通告',
  content text not null,
  attachment_path text,
  visibility text not null default 'public' check (visibility in ('public','members')),
  published_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default '特別聚會',
  starts_at timestamptz not null,
  location text,
  description text,
  featured boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.prayer_requests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default '堂會代禱',
  content text not null,
  published_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.page_content (
  id uuid primary key default gen_random_uuid(),
  page text not null,
  content_key text not null,
  content_html text not null,
  visibility text not null default 'public' check (visibility in ('public','members')),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (page, content_key)
);
create table if not exists public.prayer_submissions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  fellowship text,
  content text not null,
  status text not null default 'new' check (status in ('new','prayed','archived')),
  created_at timestamptz not null default now(),
  handled_by uuid references auth.users(id),
  handled_at timestamptz
);

create or replace function public.is_member_or_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid());
$$;
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role in ('staff','admin'));
$$;

alter table public.profiles enable row level security;
alter table public.notices enable row level security;
alter table public.events enable row level security;
alter table public.prayer_requests enable row level security;
alter table public.page_content enable row level security;
alter table public.prayer_submissions enable row level security;

drop policy if exists "profiles_self_read" on public.profiles;
create policy "profiles_self_read" on public.profiles for select using (id = auth.uid());
drop policy if exists "public_notices_read" on public.notices;
create policy "public_notices_read" on public.notices for select using (visibility = 'public' and published_at <= now());
drop policy if exists "member_notices_read" on public.notices;
create policy "member_notices_read" on public.notices for select using (visibility = 'members' and public.is_member_or_staff());
drop policy if exists "staff_notices_write" on public.notices;
create policy "staff_notices_write" on public.notices for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists "public_events_read" on public.events;
create policy "public_events_read" on public.events for select using (true);
drop policy if exists "staff_events_write" on public.events;
create policy "staff_events_write" on public.events for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists "public_prayers_read" on public.prayer_requests;
create policy "public_prayers_read" on public.prayer_requests for select using (true);
drop policy if exists "staff_prayers_write" on public.prayer_requests;
create policy "staff_prayers_write" on public.prayer_requests for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists "public_page_content_read" on public.page_content;
create policy "public_page_content_read" on public.page_content for select using (visibility = 'public');
drop policy if exists "staff_page_content_write" on public.page_content;
create policy "staff_page_content_write" on public.page_content for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists "public_prayer_submissions_insert" on public.prayer_submissions;
create policy "public_prayer_submissions_insert" on public.prayer_submissions for insert with check (true);
drop policy if exists "staff_prayer_submissions_read" on public.prayer_submissions;
create policy "staff_prayer_submissions_read" on public.prayer_submissions for select using (public.is_staff());
drop policy if exists "staff_prayer_submissions_update" on public.prayer_submissions;
create policy "staff_prayer_submissions_update" on public.prayer_submissions for update using (public.is_staff()) with check (public.is_staff());

-- The bucket already exists per project brief. These policies protect private PDFs.
drop policy if exists "member_documents_read" on storage.objects;
create policy "member_documents_read" on storage.objects for select using (bucket_id = 'member-documents' and public.is_member_or_staff());
drop policy if exists "staff_documents_write" on storage.objects;
create policy "staff_documents_write" on storage.objects for insert with check (bucket_id = 'member-documents' and public.is_staff());
drop policy if exists "staff_documents_update" on storage.objects;
create policy "staff_documents_update" on storage.objects for update using (bucket_id = 'member-documents' and public.is_staff());
drop policy if exists "staff_documents_delete" on storage.objects;
create policy "staff_documents_delete" on storage.objects for delete using (bucket_id = 'member-documents' and public.is_staff());

-- Run after the supplied admin test user exists in Auth.
insert into public.profiles (id, display_name, role)
select id, '迦福堂測試幹事', 'admin'
from auth.users
where email = 'admin_test@kfphc.org'
on conflict (id) do update set role = excluded.role, display_name = excluded.display_name;
