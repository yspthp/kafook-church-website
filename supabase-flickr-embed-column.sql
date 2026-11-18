-- 新增活動照片相簿 flickr_embed_html 選填覆寫欄位（供同工在需要時直接貼上 Flickr 原始內嵌程式碼）
-- 注意：已存在的 album-2026-dedication 相簿記錄保持不變，不會重複寫入。

ALTER TABLE public.photo_albums
  ADD COLUMN IF NOT EXISTS flickr_embed_html text;

COMMENT ON COLUMN public.photo_albums.flickr_embed_html IS
  '選填覆寫：同工可貼上 Flickr「分享 → 內嵌」（取消勾選頁首及頁尾）產生的原始嵌入 HTML；留空時由前端依 flickr_album_url 自動組裝。';
