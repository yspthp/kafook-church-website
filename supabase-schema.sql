-- Run this entire file once (or re-run safely at any time) in Supabase Dashboard > SQL Editor.
-- Idempotent schema + Phase 8 migration for Ka Fook Pentecostal Holiness Church website.

create extension if not exists pgcrypto;

-- 1. Core Tables
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
  content_html text,
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
  content_html text,
  featured boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.prayer_requests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default '大堂代禱事項',
  content text not null,
  content_html text,
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
  needs_followup boolean not null default false,
  contact_info text,
  status text not null default 'new' check (status in ('new','prayed','archived')),
  created_at timestamptz not null default now(),
  handled_by uuid references auth.users(id),
  handled_at timestamptz
);

-- 2. Idempotent Column Migrations for Existing Deployments
alter table public.notices add column if not exists content_html text;
alter table public.events add column if not exists content_html text;
alter table public.prayer_requests add column if not exists content_html text;
alter table public.prayer_requests alter column category set default '大堂代禱事項';
alter table public.prayer_submissions add column if not exists needs_followup boolean not null default false;
alter table public.prayer_submissions add column if not exists contact_info text;

-- Ensure any legacy constraint on prayer_requests.category allows both '大堂代禱事項' and '禱告邀約'
alter table public.prayer_requests drop constraint if exists prayer_requests_category_check;
alter table public.prayer_requests add constraint prayer_requests_category_check
  check (category in ('大堂代禱事項', '堂會代禱', '建堂守望', '社區福音', '肢體關顧', '禱告邀約'));

-- 3. Role Helper Functions
create or replace function public.is_member_or_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid());
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role in ('staff','admin'));
$$;

-- 4. Enable Row Level Security (RLS)
alter table public.profiles enable row level security;
alter table public.notices enable row level security;
alter table public.events enable row level security;
alter table public.prayer_requests enable row level security;
alter table public.page_content enable row level security;
alter table public.prayer_submissions enable row level security;

-- 5. RLS Policies
drop policy if exists "profiles_self_read" on public.profiles;
create policy "profiles_self_read" on public.profiles
  for select using (id = auth.uid());

drop policy if exists "public_notices_read" on public.notices;
create policy "public_notices_read" on public.notices
  for select using (visibility = 'public' and published_at <= now());

drop policy if exists "member_notices_read" on public.notices;
create policy "member_notices_read" on public.notices
  for select using (visibility = 'members' and public.is_member_or_staff());

drop policy if exists "staff_notices_write" on public.notices;
create policy "staff_notices_write" on public.notices
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "public_events_read" on public.events;
create policy "public_events_read" on public.events
  for select using (true);

drop policy if exists "staff_events_write" on public.events;
create policy "staff_events_write" on public.events
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "public_prayers_read" on public.prayer_requests;
create policy "public_prayers_read" on public.prayer_requests
  for select using (true);

drop policy if exists "staff_prayers_write" on public.prayer_requests;
create policy "staff_prayers_write" on public.prayer_requests
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "public_page_content_read" on public.page_content;
create policy "public_page_content_read" on public.page_content
  for select using (visibility = 'public');

drop policy if exists "staff_page_content_write" on public.page_content;
create policy "staff_page_content_write" on public.page_content
  for all using (public.is_staff()) with check (public.is_staff());

-- prayer_submissions RLS: Public can INSERT only; ONLY staff/admin can SELECT or UPDATE.
-- contact_info and submission contents are NEVER publicly readable.
drop policy if exists "public_prayer_submissions_insert" on public.prayer_submissions;
create policy "public_prayer_submissions_insert" on public.prayer_submissions
  for insert with check (
    (needs_followup = false) or (contact_info is not null and length(btrim(contact_info)) > 0)
  );

drop policy if exists "staff_prayer_submissions_read" on public.prayer_submissions;
create policy "staff_prayer_submissions_read" on public.prayer_submissions
  for select using (public.is_staff());

drop policy if exists "staff_prayer_submissions_update" on public.prayer_submissions;
create policy "staff_prayer_submissions_update" on public.prayer_submissions
  for update using (public.is_staff()) with check (public.is_staff());

-- 6. Storage Buckets & RLS: member-documents (private) & cms-media (public)
insert into storage.buckets (id, name, public)
values ('member-documents', 'member-documents', false)
on conflict (id) do update set public = false;

insert into storage.buckets (id, name, public)
values ('cms-media', 'cms-media', true)
on conflict (id) do update set public = true;

drop policy if exists "member_documents_read" on storage.objects;
create policy "member_documents_read" on storage.objects
  for select using (bucket_id = 'member-documents' and public.is_member_or_staff());

drop policy if exists "staff_documents_write" on storage.objects;
create policy "staff_documents_write" on storage.objects
  for insert with check (bucket_id = 'member-documents' and public.is_staff());

drop policy if exists "staff_documents_update" on storage.objects;
create policy "staff_documents_update" on storage.objects
  for update using (bucket_id = 'member-documents' and public.is_staff());

drop policy if exists "staff_documents_delete" on storage.objects;
create policy "staff_documents_delete" on storage.objects
  for delete using (bucket_id = 'member-documents' and public.is_staff());

drop policy if exists "cms_media_public_read" on storage.objects;
create policy "cms_media_public_read" on storage.objects
  for select using (bucket_id = 'cms-media');

drop policy if exists "cms_media_staff_insert" on storage.objects;
create policy "cms_media_staff_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'cms-media' and public.is_staff());

drop policy if exists "cms_media_staff_update" on storage.objects;
create policy "cms_media_staff_update" on storage.objects
  for update to authenticated using (bucket_id = 'cms-media' and public.is_staff());

drop policy if exists "cms_media_staff_delete" on storage.objects;
create policy "cms_media_staff_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'cms-media' and public.is_staff());

-- 7. Seed Initial Editable Page Content Keys (Do Nothing if Staff Already Edited)
insert into public.page_content (page, content_key, content_html, visibility)
values
  (
    'index.html',
    'home_promised_land',
    '<p>諾知原中心 (Promised Land) 由基督教五旬節聖潔會迦福堂開辦，2012年12月正式投入服務。服務對象為區內居民、中小學生及青少年，透過興趣班、講座、功課輔導班等課程和活動，提升學生的學習興趣和動力，引發個人潛能發展，從而活出自信豐盛的人生。</p><p>教學理念：「耶穌的智慧和身量，並神和人喜愛他的心，都一齊增長。」（路加福音2:52）在專注教學的同時，亦兼顧學生的個人生命成長，引導他們建立健康的自我形象和價值觀，致使他們在知識、體格、心靈和人際關係各方面，均得到全面的發展和成長。</p><p>課程查詢：<a href="mailto:promised-land@kfphc.org">promised-land@kfphc.org</a></p>',
    'public'
  ),
  (
    'events.html',
    'events_gathering_notice',
    '<strong>聚會提示</strong><p>最新特別聚會及崇拜安排提示待補充。</p>',
    'public'
  ),
  (
    'events.html',
    'events_children_worship',
    '<span class="schedule-badge">週日 11:15（與午堂崇拜同時舉行）</span><h4>兒童崇拜</h4><p>適合幼稚園（由 K1 開始）及小學生參與；詳細聚會內容待補充。</p>',
    'public'
  ),
  (
    'about.html',
    'staff_bio_1',
    '<p class="about-muted">自我介紹內容待補充。</p>',
    'public'
  ),
  (
    'about.html',
    'staff_bio_2',
    '<p class="about-muted">自我介紹內容待補充。</p>',
    'public'
  ),
  (
    'about.html',
    'staff_bio_3',
    '<p class="about-muted">自我介紹內容待補充。</p>',
    'public'
  ),
  (
    'about.html',
    'staff_bio_4',
    '<p class="about-muted">自我介紹內容待補充。</p>',
    'public'
  ),
  (
    'about.html',
    'staff_bio_5',
    '<p class="about-muted">自我介紹內容待補充。</p>',
    'public'
  ),
  (
    'shared',
    'shared_faq_list',
    '<details class="about-faq-item" open><summary><span>01</span>崇拜會做什麼？</summary><p>我們會一同唱詩歌敬拜、同心禱告，並聆聽牧者按聖經分享信息；透過詩歌與真道親近神，彼此祝福。不用擔心不熟悉流程，現場均有投影及同工協助。</p></details><details class="about-faq-item" open><summary><span>02</span>崇拜時間有多長？</summary><p>約1小時30分鐘，包括詩歌敬拜和講道。</p></details><details class="about-faq-item" open><summary><span>03</span>崇拜有服飾要求嗎？</summary><p>沒有特別要求，穿您覺得舒適的衣服就好。請避免衣著暴露，也不適宜穿著拖鞋。</p></details><details class="about-faq-item" open><summary><span>04</span>我可以帶同孩子參與嗎？</summary><p>歡迎！週日午堂崇拜（11:15）同時設有兒童崇拜，讓小朋友在適合他們的群體中敬拜和學習聖經；禮堂亦設有直播間，方便家長攜同幼兒參與崇拜。若您的孩子已踏入青少年階段，我們也設有青少年崇拜（週六 17:30–18:30，主要對象為中學及大專學生）。</p></details><details class="about-faq-item" open><summary><span>05</span>兒童崇拜適合甚麼年齡的小朋友參加？</summary><p>兒童崇拜由幼稚園 K1 開始，適合幼稚園及小學階段的小朋友參與（於週日 11:15 與午堂崇拜同時舉行）。</p></details><details class="about-faq-item" open><summary><span>06</span>奉獻是崇拜過程必須的嗎？</summary><p>不需要。奉獻是在明白奉獻意義的情況下自願的回應，並非必須。</p></details>',
    'public'
  )
on conflict (page, content_key) do nothing;

-- 8. Optional Admin Profile Promotion (when admin_test@kfphc.org exists in Auth)
insert into public.profiles (id, display_name, role)
select id, '迦福堂測試幹事', 'admin'
from auth.users
where email = 'admin_test@kfphc.org'
on conflict (id) do update set role = excluded.role, display_name = excluded.display_name;
