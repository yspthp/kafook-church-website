-- 講道錄音 (public.sermons) 新增 soundcloud_player_src 欄位並寫入 3 筆完整音軌資料
-- 說明：
--   1. soundcloud_player_src 原樣儲存 SoundCloud「分享 → 內嵌」iframe 之完整 src（含 api.soundcloud.com/tracks/soundcloud:tracks:{ID}?secret_token={TOKEN}）。
--   2. soundcloud_url 僅儲存秘密連結（Permalink），作「前往 SoundCloud」備用按鈕及後台參考之用，不再傳入播放器。

CREATE TABLE IF NOT EXISTS public.sermons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_key text UNIQUE,
  sermon_date date,
  speaker text,
  soundcloud_url text,
  soundcloud_player_src text,
  is_published boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sermons
  ADD COLUMN IF NOT EXISTS soundcloud_player_src text;

ALTER TABLE public.sermons
  DROP COLUMN IF EXISTS title,
  DROP COLUMN IF EXISTS scripture,
  DROP COLUMN IF EXISTS series,
  DROP COLUMN IF EXISTS duration_label;

DELETE FROM public.sermons;

INSERT INTO public.sermons (
  content_key,
  sermon_date,
  speaker,
  soundcloud_url,
  soundcloud_player_src,
  is_published,
  sort_order
)
VALUES
  (
    'sermon_2026_11_15',
    '2026-11-15',
    '黎汝佳牧師',
    'https://soundcloud.com/kfphctesting/2026-11-15_1_z7f1/s-VbfxG0fcx0h',
    'https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/soundcloud%3Atracks%3A2440489659%3Fsecret_token%3Ds-VbfxG0fcx0h&color=%23ff5500&auto_play=false&hide_related=false&show_comments=true&show_user=true&show_reposts=false&show_teaser=true&visual=true',
    true,
    10
  ),
  (
    'sermon_2026_11_08',
    '2026-11-08',
    '林肇楓牧師',
    'https://soundcloud.com/kfphctesting/2026-11-08_0_x6n0/s-yoi70pHscSC',
    'https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/soundcloud%3Atracks%3A2440489332%3Fsecret_token%3Ds-yoi70pHscSC&color=%23ff5500&auto_play=false&hide_related=false&show_comments=true&show_user=true&show_reposts=false&show_teaser=true&visual=true',
    true,
    20
  ),
  (
    'sermon_2026_11_01',
    '2026-11-01',
    '林淑櫻牧師',
    'https://soundcloud.com/kfphctesting/2026-11-01_2_dqln/s-X7w80eflZiV',
    'https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/soundcloud%3Atracks%3A2440488972%3Fsecret_token%3Ds-X7w80eflZiV&color=%23ff5500&auto_play=false&hide_related=false&show_comments=true&show_user=true&show_reposts=false&show_teaser=true&visual=true',
    true,
    30
  );
