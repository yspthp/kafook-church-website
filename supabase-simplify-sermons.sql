-- 講道錄音 (public.sermons) 資料表精簡結構與 3 筆已驗證 SoundCloud 音軌初始化腳本
-- 說明：
--   1. SoundCloud 播放器內建顯示音軌標題與錄音時長，僅保留 sermon_date、speaker、soundcloud_url 及系統欄位。
--   2. soundcloud_url 欄位僅儲存秘密連結（Secret Permalink），不含嵌入 HTML 及 ?si= 參數。
--   3. 清除舊有佔位測試資料（如 2026-10-25），重新寫入 3 筆已驗證音軌。

CREATE TABLE IF NOT EXISTS public.sermons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_key text UNIQUE,
  sermon_date date,
  speaker text,
  soundcloud_url text,
  is_published boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sermons
  DROP COLUMN IF EXISTS title,
  DROP COLUMN IF EXISTS scripture,
  DROP COLUMN IF EXISTS series,
  DROP COLUMN IF EXISTS duration_label;

-- 清除先前佔位資料，重新寫入 3 筆已驗證講道錄音
DELETE FROM public.sermons;

INSERT INTO public.sermons (
  content_key,
  sermon_date,
  speaker,
  soundcloud_url,
  is_published,
  sort_order
)
VALUES
  (
    'sermon_2026_11_15',
    '2026-11-15',
    '黎汝佳牧師',
    'https://soundcloud.com/kfphctesting/2026-11-15_1_z7f1/s-VbfxG0fcx0h',
    true,
    10
  ),
  (
    'sermon_2026_11_08',
    '2026-11-08',
    '林肇楓牧師',
    'https://soundcloud.com/kfphctesting/2026-11-08_0_x6n0/s-yoi70pHscSC',
    true,
    20
  ),
  (
    'sermon_2026_11_01',
    '2026-11-01',
    '林淑櫻牧師',
    'https://soundcloud.com/kfphctesting/2026-11-01_2_dqln/s-X7w80eflZiV',
    true,
    30
  );
