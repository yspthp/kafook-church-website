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

-- 8A. Structured Church History Milestones Table (public.history_milestones)
create table if not exists public.history_milestones (
  id uuid primary key default gen_random_uuid(),
  year_label text not null,
  sort_year integer not null,
  sort_order integer not null default 0,
  title text not null,
  detail_html text,
  photo_path text,
  photo_alt text,
  is_published boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists history_milestones_year_title_idx
  on public.history_milestones (year_label, title);

create index if not exists history_milestones_sort_idx
  on public.history_milestones (is_published, sort_year asc, sort_order asc);

-- 2. Idempotent Column Migrations for Existing Deployments
alter table public.notices add column if not exists content_html text;
alter table public.events add column if not exists content_html text;
alter table public.prayer_requests add column if not exists content_html text;
alter table public.prayer_requests alter column category set default '大堂代禱事項';
alter table public.prayer_submissions add column if not exists needs_followup boolean not null default false;
alter table public.prayer_submissions add column if not exists contact_info text;

alter table public.history_milestones add column if not exists year_label text;
alter table public.history_milestones add column if not exists sort_year integer;
alter table public.history_milestones add column if not exists sort_order integer not null default 0;
alter table public.history_milestones add column if not exists title text;
alter table public.history_milestones add column if not exists detail_html text;
alter table public.history_milestones add column if not exists photo_path text;
alter table public.history_milestones add column if not exists photo_alt text;
alter table public.history_milestones add column if not exists is_published boolean not null default true;
alter table public.history_milestones add column if not exists created_by uuid references auth.users(id);
alter table public.history_milestones add column if not exists created_at timestamptz not null default now();
alter table public.history_milestones add column if not exists updated_at timestamptz not null default now();

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
alter table public.history_milestones enable row level security;

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

-- history_milestones RLS: Public SELECT only where is_published = true; Staff ALL via public.is_staff()
drop policy if exists "public_history_milestones_read" on public.history_milestones;
create policy "public_history_milestones_read" on public.history_milestones
  for select using (is_published = true);

drop policy if exists "staff_history_milestones_write" on public.history_milestones;
create policy "staff_history_milestones_write" on public.history_milestones
  for all using (public.is_staff()) with check (public.is_staff());

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

-- 8. Seed Initial 14 Church History Milestones (Idempotent: Do Nothing if Already Seeded)
insert into public.history_milestones (year_label, sort_year, sort_order, title, detail_html, is_published)
values
  (
    '1968',
    1968,
    10,
    '慈雲山開基',
    '<p>1966年借用慈雲山一間醫務所作聚會地點，1968年正式成立「五旬節聖潔會慈雲山堂」，初期聚會人數只有十多人。</p>',
    true
  ),
  (
    '1969',
    1969,
    20,
    '永光小學時期',
    '<p>遷入五旬節聖潔會第二永光學校，以學校作為福音工作的重要平台。七十至八十年代以小學生佈道為主要發展方向；至八十年代末，聚會人數增長至接近二百人，教會經濟亦漸趨穩定。</p>',
    true
  ),
  (
    '1995–1996',
    1995,
    30,
    '首次置業・更名迦福堂',
    '<p>因應慈雲山區重建，教會成立「建堂委員會」，由等待政府安置轉向自行置業。1995年購入九龍城嘉福閣閣樓單位；1996年正式進駐九龍城，並因地域遷移改名為「五旬節聖潔會迦福堂」。</p>',
    true
  ),
  (
    '1999',
    1999,
    40,
    '青年架構重組',
    '<p>原有高中團契彼得團及初中團契約翰團，重組為大專團契「彼得之家」，以及少年團「Teen家」及「豐盛之家」，確立以學生工作作為福音發展主幹。</p>',
    true
  ),
  (
    '2002',
    2002,
    50,
    '落戶觀塘',
    '<p>因聚會空間不敷應用，遷往觀塘道410號觀點中心12樓，展開觀塘區的長遠服侍。</p>',
    true
  ),
  (
    '2006',
    2006,
    60,
    '分家與小組牧養',
    '<p>成立雅比斯之家並推行小組牧養；拓展大專團契安得烈團，由彼得之家分為雲彩之家、懷道之家、恩火之家及傳光之家；少年團分為錫安之家、甘霖之家、曙光之家、薪火之家及基石之家。</p>',
    true
  ),
  (
    '2007–2008',
    2007,
    70,
    '入校工作與首支隊工',
    '<p>2007年與東華三院呂潤財紀念中學合辦香港基督少年軍，開展將軍澳入校工作。2008年成立本堂第一支隊工「恩冕籃球隊」。</p>',
    true
  ),
  (
    '2011',
    2011,
    80,
    '棋匯坊成立',
    '<p>成立隊工「棋匯坊」，以板棋作為傳福音媒介，藉活動與新朋友建立關係。</p>',
    true
  ),
  (
    '2012',
    2012,
    90,
    '諾知原開辦',
    '<p>於將軍澳慧安商場開辦「諾知原教育中心」（Promised Land），以補習班及興趣班接觸區內學生。同年於迦密主恩中學開展學生信仰小組，並首次舉辦柬埔寨短宣團。</p>',
    true
  ),
  (
    '2013–2016',
    2013,
    100,
    '傳恩之家與入校資助',
    '<p>2013年成立傳恩之家，作為中學文憑試考生及大專生的牧養群體；同年獲教育局區本計劃資助，與高雷中學合作舉辦課程。至2016年已與觀塘及將軍澳區五所中學建立合作，包括高雷中學、新生命教育協會呂郭碧鳳中學、聖安當女書院、東華三院呂潤財紀念中學及迦密主恩中學，透過學術課程、功課輔導及義工訓練等接觸逾百名中學生。</p>',
    true
  ),
  (
    '2016',
    2016,
    110,
    '提摩太團成立',
    '<p>成立活泉之家，與傳恩之家合組成「提摩太團」，聚焦大專生活中的信仰挑戰與大專校園福音工作。</p>',
    true
  ),
  (
    '2017',
    2017,
    120,
    '小組化牧養與建堂起步',
    '<p>安得烈團重組為六個小組：申命、因愛、葡萄園、傳愛、恩悅、承命，其中申命及因愛為夫婦小組，其餘為職青小組；少年團重組為揚光之家及使命之家。同年11月購入觀塘成業街10號電訊一代廣場23樓C2室，並啟動「天國小錢」建堂捐獻計劃。</p>',
    true
  ),
  (
    '2018',
    2018,
    130,
    '五十週年堂慶',
    '<p>推動「全堂合一佈道運動」及相關堂慶活動，總結多年來的組織發展與福音外展。</p>',
    true
  ),
  (
    '2024–2026',
    2024,
    140,
    '新堂啟用',
    '<p>2024年啟動「天國小錢2025」建堂捐獻計劃；2025年購置新堂物業；2026年1月25日舉行新堂啟用與獻堂感恩崇拜。</p>',
    true
  )
on conflict (year_label, title) do nothing;

-- 9. Optional Admin Profile Promotion (when admin_test@kfphc.org exists in Auth)
insert into public.profiles (id, display_name, role)
select id, '迦福堂測試幹事', 'admin'
from auth.users
where email = 'admin_test@kfphc.org'
on conflict (id) do update set role = excluded.role, display_name = excluded.display_name;
