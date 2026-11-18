/* 五旬節聖潔會迦福堂 — 管理後台會友專區三大分頁控制器 (js/admin-member-area.js)
 * Phase 5：事奉輪值表 / 講道錄音 / 活動照片
 * 沿用 Warm Timber 設計、Quill 富文本編輯器、DOMPurify 與 cms-media / member-documents 儲存桶模式
 */
(function () {
  'use strict';

  const ROTA_LABELS = {
    sanctuary: '大堂崇拜事奉輪值表',
    youth: '青少年崇拜輪值表',
    prayer: '祈禱會輪值表',
    flowers: '插花輪值表',
    headcount: '崇拜點算人數輪值表',
    other: '其他事奉輪值表'
  };

  let rotaNotesQuill = null;
  let albumDescQuill = null;
  let rotaRows = [];
  let sermonRows = [];
  let albumRows = [];
  let initialized = false;

  const esc = (v) => String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const cleanHtml = (v) => {
    const raw = String(v ?? '').trim();
    if (!raw || raw === '<p><br></p>') return '';
    if (window.DOMPurify) {
      return window.DOMPurify.sanitize(raw, {
        USE_PROFILES: { html: true },
        ADD_ATTR: ['target', 'rel', 'loading']
      });
    }
    return raw;
  };

  function bridge() {
    return window.KF_ADMIN_BRIDGE || {};
  }

  function toast(msg, type = 'info') {
    if (typeof bridge().showToast === 'function') {
      bridge().showToast(msg, type);
    } else {
      console.log('[KF Admin Member]', type, msg);
    }
  }

  function initQuills() {
    if (!window.Quill) return;
    const toolbar = [
      [{ header: [3, 4, false] }],
      ['bold', 'italic', 'underline'],
      [{ list: 'ordered' }, { list: 'bullet' }],
      ['link', 'clean']
    ];
    const rotaEl = document.getElementById('rotaNotesEditor');
    if (rotaEl && !rotaNotesQuill) {
      rotaNotesQuill = new window.Quill(rotaEl, {
        theme: 'snow',
        placeholder: '可貼上或編輯輪值表底部的「註」事項…',
        modules: { toolbar }
      });
    }
    const albumEl = document.getElementById('albumDescEditor');
    if (albumEl && !albumDescQuill) {
      albumDescQuill = new window.Quill(albumEl, {
        theme: 'snow',
        placeholder: '請輸入活動照片相簿簡介（選填）…',
        modules: { toolbar }
      });
    }
  }

  async function togglePublish(table, id, nextState, reloadFn) {
    const client = bridge().getClient?.();
    if (!client) return;
    const { error } = await client.from(table).update({ is_published: nextState }).eq('id', id);
    if (error) return toast(`更新發布狀態失敗：${error.message}`, 'error');
    toast(nextState ? '已設為發布' : '已設為草稿', 'success');
    await reloadFn();
  }

  async function swapSortOrder(table, list, index, dir, reloadFn) {
    const client = bridge().getClient?.();
    if (!client) return;
    const targetIdx = index + dir;
    if (targetIdx < 0 || targetIdx >= list.length) return;
    const a = list[index];
    const b = list[targetIdx];
    const orderA = Number(a.sort_order ?? (index + 1) * 10);
    const orderB = Number(b.sort_order ?? (targetIdx + 1) * 10);
    const newA = orderA === orderB ? (targetIdx + 1) * 10 : orderB;
    const newB = orderA === orderB ? (index + 1) * 10 : orderA;

    const r1 = await client.from(table).update({ sort_order: newA }).eq('id', a.id);
    const r2 = await client.from(table).update({ sort_order: newB }).eq('id', b.id);
    if (r1.error || r2.error) return toast('調整排序失敗', 'error');
    toast('已更新排序', 'success');
    await reloadFn();
  }

  async function deleteRow(table, id, label, reloadFn) {
    const client = bridge().getClient?.();
    if (!client) return;
    if (!window.confirm(`確定要刪除「${label}」嗎？此操作無法復原。`)) return;
    const { error } = await client.from(table).delete().eq('id', id);
    if (error) return toast(`刪除失敗：${error.message}`, 'error');
    toast('已刪除紀錄', 'success');
    await reloadFn();
  }

  /* ---------- 1. 事奉輪值表管理 (rota_documents) ---------- */
  function resetRotaForm() {
    const form = document.getElementById('rotaAdminForm');
    if (!form) return;
    form.reset();
    document.getElementById('rotaIdInput').value = '';
    document.getElementById('rotaPdfPathInput').value = '';
    document.getElementById('rotaCurrentPdfLabel').textContent = '尚未選擇或上載 PDF 檔案';
    document.getElementById('rotaPublishedInput').checked = true;
    document.getElementById('rotaSortOrderInput').value = '10';
    if (rotaNotesQuill) rotaNotesQuill.setContents([]);
  }

  function fillRotaForm(doc, asCopy = false) {
    document.getElementById('rotaIdInput').value = asCopy ? '' : (doc.id || '');
    document.getElementById('rotaTypeInput').value = doc.rota_type || 'sanctuary';
    document.getElementById('rotaTitleInput').value = doc.title || '';
    document.getElementById('rotaPeriodLabelInput').value = asCopy ? '' : (doc.period_label || '');
    document.getElementById('rotaPeriodStartInput').value = asCopy ? '' : (doc.period_start || '');
    document.getElementById('rotaPeriodEndInput').value = asCopy ? '' : (doc.period_end || '');
    document.getElementById('rotaUpdatedOnInput').value = asCopy ? '' : (doc.updated_on_label || '');
    document.getElementById('rotaPageCountInput').value = asCopy ? '' : (doc.page_count ?? '');
    document.getElementById('rotaSortOrderInput').value = asCopy
      ? String((Number(doc.sort_order) || 0) + 10)
      : String(doc.sort_order ?? 10);
    document.getElementById('rotaPublishedInput').checked = doc.is_published !== false;
    document.getElementById('rotaPdfPathInput').value = asCopy ? '' : (doc.pdf_path || '');
    document.getElementById('rotaCurrentPdfLabel').textContent = (!asCopy && doc.pdf_path)
      ? `目前檔案：${doc.pdf_path}`
      : (asCopy ? '複製模式：請填寫新期別並上載新一期 PDF' : '尚未上載 PDF 檔案');

    if (rotaNotesQuill) {
      rotaNotesQuill.clipboard.dangerouslyPasteHTML(doc.notes_html || '');
    }

    document.getElementById('rotaAdminForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (asCopy) {
      document.getElementById('rotaPeriodLabelInput')?.focus();
      toast('已複製上一期資料，請輸入新期別並上載新一期 PDF', 'info');
    }
  }

  async function loadRotasAdmin() {
    const listEl = document.getElementById('adminRotasList');
    const client = bridge().getClient?.();
    if (!listEl || !client) return;

    const { data, error } = await client
      .from('rota_documents')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('period_start', { ascending: false });

    if (error) {
      listEl.innerHTML = `<p class="text-xs text-red-700 m-0">載入失敗：${esc(error.message)}</p>`;
      return;
    }

    rotaRows = Array.isArray(data) ? data : [];
    if (!rotaRows.length) {
      listEl.innerHTML = '<p class="text-xs text-kf-inkMuted m-0">目前尚無輪值表紀錄。</p>';
      return;
    }

    listEl.replaceChildren();
    rotaRows.forEach((doc, idx) => {
      const card = document.createElement('div');
      card.className = 'p-4 rounded-xl border border-kf-border bg-kf-bg flex flex-col gap-3';

      const idxStatus = doc.search_text
        ? '<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">已建立搜尋索引</span>'
        : '<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">未建立搜尋索引</span>';
      const pdfStatus = doc.pdf_path
        ? `<span class="text-xs text-kf-inkMuted">PDF：${esc(doc.pdf_path)}（${doc.page_count || '?'} 頁）</span>`
        : '<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-stone-200 text-stone-700">待上載 PDF</span>';
      const pubBadge = doc.is_published
        ? '<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">已發布</span>'
        : '<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-stone-200 text-stone-700">草稿</span>';

      card.innerHTML = `
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div class="flex flex-wrap items-center gap-2 mb-1">
              <span class="px-2 py-0.5 rounded-full text-xs font-medium bg-kf-sand text-kf-walnut">${esc(ROTA_LABELS[doc.rota_type] || doc.rota_type)}</span>
              <span class="text-xs font-semibold text-kf-ink">${esc(doc.period_label)}</span>
              ${pubBadge}
              ${idxStatus}
            </div>
            <h4 class="text-sm font-semibold text-kf-ink m-0">${esc(doc.title)}</h4>
            <div class="flex flex-wrap gap-3 mt-1 text-xs text-kf-inkMuted">
              ${pdfStatus}
              ${doc.updated_on_label ? `<span>更新日期：${esc(doc.updated_on_label)}</span>` : ''}
              <span>排序：${esc(doc.sort_order)}</span>
            </div>
          </div>
          <div class="flex flex-wrap gap-1.5" data-actions></div>
        </div>
      `;

      const actWrap = card.querySelector('[data-actions]');
      const mkBtn = (label, cls, onClick) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `px-2.5 py-1 rounded-lg text-xs font-medium border cursor-pointer ${cls}`;
        b.textContent = label;
        b.addEventListener('click', onClick);
        return b;
      };

      actWrap.append(
        mkBtn('編輯', 'bg-white border-kf-border text-kf-ink hover:bg-kf-sand', () => fillRotaForm(doc, false)),
        mkBtn('複製上一期', 'bg-white border-kf-border text-kf-walnut hover:bg-kf-sand', () => fillRotaForm(doc, true)),
        mkBtn('重建搜尋索引', 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100', async () => {
          if (!window.KF_ROTA_INDEXER) return toast('搜尋索引工具尚未載入', 'error');
          const res = await window.KF_ROTA_INDEXER.rebuildRotaSearchIndex(client, doc, (msg, tone) => toast(msg, tone === 'warning' ? 'error' : tone));
          if (res?.ok || res?.warning) await loadRotasAdmin();
        }),
        mkBtn(doc.is_published ? '設為草稿' : '發布', 'bg-white border-kf-border text-kf-inkSoft hover:bg-kf-sand', () => togglePublish('rota_documents', doc.id, !doc.is_published, loadRotasAdmin)),
        mkBtn('上移', 'bg-white border-kf-border text-kf-inkSoft hover:bg-kf-sand', () => swapSortOrder('rota_documents', rotaRows, idx, -1, loadRotasAdmin)),
        mkBtn('下移', 'bg-white border-kf-border text-kf-inkSoft hover:bg-kf-sand', () => swapSortOrder('rota_documents', rotaRows, idx, 1, loadRotasAdmin)),
        mkBtn('刪除', 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100', () => deleteRow('rota_documents', doc.id, `${doc.title} ${doc.period_label}`, loadRotasAdmin))
      );

      listEl.append(card);
    });
  }

  async function saveRotaForm(e) {
    e.preventDefault();
    const client = bridge().getClient?.();
    const user = bridge().getUser?.();
    if (!client || !user) return toast('請先登入同工帳號', 'error');

    const editId = document.getElementById('rotaIdInput').value.trim();
    const rotaType = document.getElementById('rotaTypeInput').value;
    const title = document.getElementById('rotaTitleInput').value.trim();
    const periodLabel = document.getElementById('rotaPeriodLabelInput').value.trim();
    const periodStart = document.getElementById('rotaPeriodStartInput').value || null;
    const periodEnd = document.getElementById('rotaPeriodEndInput').value || null;
    const updatedOn = document.getElementById('rotaUpdatedOnInput').value.trim() || null;
    const sortOrder = Number(document.getElementById('rotaSortOrderInput').value) || 0;
    const isPublished = document.getElementById('rotaPublishedInput').checked;
    const notesHtml = cleanHtml(rotaNotesQuill ? rotaNotesQuill.root.innerHTML : '');
    const fileInput = document.getElementById('rotaPdfFileInput');
    const pdfFile = fileInput?.files?.[0];

    let pdfPath = document.getElementById('rotaPdfPathInput').value.trim() || null;
    const pageCountVal = document.getElementById('rotaPageCountInput').value.trim();
    let pageCount = pageCountVal ? Number(pageCountVal) : null;

    const payload = {
      rota_type: rotaType,
      title,
      period_label: periodLabel,
      period_start: periodStart,
      period_end: periodEnd,
      updated_on_label: updatedOn,
      notes_html: notesHtml || null,
      sort_order: sortOrder,
      is_published: isPublished
    };

    if (pdfFile) {
      toast('正在上載 PDF 並讀取頁數與搜尋索引…', 'info');
      const safeName = pdfFile.name.replace(/[^\w.\-]+/g, '-');
      const targetPath = `rotas/${Date.now()}-${safeName}`;
      const upRes = await client.storage
        .from(bridge().DOCS_BUCKET || 'member-documents')
        .upload(targetPath, pdfFile, { upsert: false, contentType: 'application/pdf' });
      if (upRes.error) return toast(`PDF 上載失敗：${upRes.error.message}`, 'error');

      pdfPath = targetPath;
      payload.pdf_path = pdfPath;

      if (window.KF_ROTA_INDEXER) {
        try {
          const extracted = await window.KF_ROTA_INDEXER.extractPdfIndexFromFile(pdfFile);
          pageCount = extracted.pageCount;
          payload.page_count = pageCount;
          payload.search_text = extracted.searchText;
          payload.search_page_map = extracted.searchPageMap;
          payload.search_indexed_at = extracted.searchIndexedAt;
          if (!extracted.searchText) {
            toast('PDF 已上載，但未能提取可搜尋文字（原檔仍可正常開啟）。', 'error');
          }
        } catch (_idxErr) {
          payload.search_text = null;
          payload.search_page_map = null;
          payload.search_indexed_at = null;
          toast('PDF 已上載，但搜尋索引提取失敗（原檔仍可正常開啟）。', 'error');
        }
      }
    } else {
      payload.pdf_path = pdfPath;
      if (pageCount !== null) payload.page_count = pageCount;
    }

    if (!editId) {
      payload.content_key = `rota_${rotaType}_${Date.now()}`;
      payload.created_by = user.id;
    }

    const { error } = editId
      ? await client.from('rota_documents').update(payload).eq('id', editId)
      : await client.from('rota_documents').insert(payload);

    if (error) return toast(`儲存輪值表失敗：${error.message}`, 'error');
    toast('已儲存事奉輪值表', 'success');
    resetRotaForm();
    await loadRotasAdmin();
  }

  /* ---------- 2. 講道錄音管理 (sermons) ---------- */
  function resetSermonForm() {
    const form = document.getElementById('sermonAdminForm');
    if (!form) return;
    form.reset();
    document.getElementById('sermonIdInput').value = '';
    document.getElementById('sermonPublishedInput').checked = true;
    document.getElementById('sermonSortOrderInput').value = '10';
  }

  function fillSermonForm(row) {
    document.getElementById('sermonIdInput').value = row.id || '';
    document.getElementById('sermonDateInput').value = row.sermon_date || '';
    document.getElementById('sermonTitleInput').value = row.title || '';
    document.getElementById('sermonSpeakerInput').value = row.speaker || '';
    document.getElementById('sermonScriptureInput').value = row.scripture || '';
    document.getElementById('sermonSeriesInput').value = row.series || '';
    document.getElementById('sermonDurationInput').value = row.duration_label || '';
    document.getElementById('sermonUrlInput').value = row.soundcloud_url || '';
    document.getElementById('sermonSortOrderInput').value = String(row.sort_order ?? 10);
    document.getElementById('sermonPublishedInput').checked = row.is_published !== false;
    document.getElementById('sermonAdminForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function loadSermonsAdmin() {
    const listEl = document.getElementById('adminSermonsList');
    const client = bridge().getClient?.();
    if (!listEl || !client) return;

    const { data, error } = await client
      .from('sermons')
      .select('*')
      .order('sermon_date', { ascending: false })
      .order('sort_order', { ascending: true });

    if (error) {
      listEl.innerHTML = `<p class="text-xs text-red-700 m-0">載入失敗：${esc(error.message)}</p>`;
      return;
    }

    sermonRows = Array.isArray(data) ? data : [];
    if (!sermonRows.length) {
      listEl.innerHTML = '<p class="text-xs text-kf-inkMuted m-0">目前尚無講道錄音紀錄。</p>';
      return;
    }

    listEl.replaceChildren();
    sermonRows.forEach((row, idx) => {
      const card = document.createElement('div');
      card.className = 'p-4 rounded-xl border border-kf-border bg-kf-bg flex flex-wrap items-start justify-between gap-3';
      const pubBadge = row.is_published
        ? '<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">已發布</span>'
        : '<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-stone-200 text-stone-700">草稿</span>';
      const urlBadge = row.soundcloud_url
        ? '<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">已連結音訊</span>'
        : '<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">待上載</span>';

      card.innerHTML = `
        <div>
          <div class="flex flex-wrap items-center gap-2 mb-1">
            <span class="text-xs font-semibold text-kf-walnut">${esc(row.sermon_date)}</span>
            <span class="text-xs text-kf-inkSoft">${esc(row.speaker || '（講員待補）')}</span>
            ${pubBadge}
            ${urlBadge}
          </div>
          <h4 class="text-sm font-semibold text-kf-ink m-0">${esc(row.title || '（講題待補）')}</h4>
          <p class="text-xs text-kf-inkMuted mt-1 mb-0">
            ${[row.scripture, row.series, row.duration_label, `排序：${row.sort_order ?? 0}`].filter(Boolean).map(esc).join(' · ')}
          </p>
        </div>
        <div class="flex flex-wrap gap-1.5" data-actions></div>
      `;

      const actWrap = card.querySelector('[data-actions]');
      const mkBtn = (label, cls, onClick) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `px-2.5 py-1 rounded-lg text-xs font-medium border cursor-pointer ${cls}`;
        b.textContent = label;
        b.addEventListener('click', onClick);
        return b;
      };
      actWrap.append(
        mkBtn('編輯', 'bg-white border-kf-border text-kf-ink hover:bg-kf-sand', () => fillSermonForm(row)),
        mkBtn(row.is_published ? '設為草稿' : '發布', 'bg-white border-kf-border text-kf-inkSoft hover:bg-kf-sand', () => togglePublish('sermons', row.id, !row.is_published, loadSermonsAdmin)),
        mkBtn('上移', 'bg-white border-kf-border text-kf-inkSoft hover:bg-kf-sand', () => swapSortOrder('sermons', sermonRows, idx, -1, loadSermonsAdmin)),
        mkBtn('下移', 'bg-white border-kf-border text-kf-inkSoft hover:bg-kf-sand', () => swapSortOrder('sermons', sermonRows, idx, 1, loadSermonsAdmin)),
        mkBtn('刪除', 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100', () => deleteRow('sermons', row.id, `${row.sermon_date} ${row.title || row.speaker}`, loadSermonsAdmin))
      );
      listEl.append(card);
    });
  }

  async function saveSermonForm(e) {
    e.preventDefault();
    const client = bridge().getClient?.();
    const user = bridge().getUser?.();
    if (!client || !user) return toast('請先登入同工帳號', 'error');

    const editId = document.getElementById('sermonIdInput').value.trim();
    const payload = {
      sermon_date: document.getElementById('sermonDateInput').value,
      title: document.getElementById('sermonTitleInput').value.trim() || null,
      speaker: document.getElementById('sermonSpeakerInput').value.trim() || null,
      scripture: document.getElementById('sermonScriptureInput').value.trim() || null,
      series: document.getElementById('sermonSeriesInput').value.trim() || null,
      duration_label: document.getElementById('sermonDurationInput').value.trim() || null,
      soundcloud_url: document.getElementById('sermonUrlInput').value.trim() || null,
      sort_order: Number(document.getElementById('sermonSortOrderInput').value) || 0,
      is_published: document.getElementById('sermonPublishedInput').checked
    };

    if (!editId) {
      payload.content_key = `sermon_${payload.sermon_date}_${Date.now()}`;
      payload.created_by = user.id;
    }

    const { error } = editId
      ? await client.from('sermons').update(payload).eq('id', editId)
      : await client.from('sermons').insert(payload);

    if (error) return toast(`儲存講道錄音失敗：${error.message}`, 'error');
    toast('已儲存講道錄音', 'success');
    resetSermonForm();
    await loadSermonsAdmin();
  }

  /* ---------- 3. 活動照片相簿管理 (photo_albums) ---------- */
  function resetAlbumForm() {
    const form = document.getElementById('albumAdminForm');
    if (!form) return;
    form.reset();
    document.getElementById('albumIdInput').value = '';
    document.getElementById('albumPublishedInput').checked = true;
    document.getElementById('albumSortOrderInput').value = '10';
    if (albumDescQuill) albumDescQuill.setContents([]);
  }

  function fillAlbumForm(row) {
    document.getElementById('albumIdInput').value = row.id || '';
    document.getElementById('albumTitleInput').value = row.title || '';
    document.getElementById('albumDateInput').value = row.event_date || '';
    document.getElementById('albumFlickrUrlInput').value = row.flickr_album_url || '';
    document.getElementById('albumCoverUrlInput').value = row.cover_photo_url || '';
    document.getElementById('albumPhotoCountInput').value = row.photo_count ?? '';
    document.getElementById('albumSortOrderInput').value = String(row.sort_order ?? 10);
    document.getElementById('albumPublishedInput').checked = row.is_published !== false;
    if (albumDescQuill) {
      albumDescQuill.clipboard.dangerouslyPasteHTML(row.description_html || '');
    }
    document.getElementById('albumAdminForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function loadAlbumsAdmin() {
    const listEl = document.getElementById('adminAlbumsList');
    const client = bridge().getClient?.();
    if (!listEl || !client) return;

    const { data, error } = await client
      .from('photo_albums')
      .select('*')
      .order('event_date', { ascending: false })
      .order('sort_order', { ascending: true });

    if (error) {
      listEl.innerHTML = `<p class="text-xs text-red-700 m-0">載入失敗：${esc(error.message)}</p>`;
      return;
    }

    albumRows = Array.isArray(data) ? data : [];
    if (!albumRows.length) {
      listEl.innerHTML = '<p class="text-xs text-kf-inkMuted m-0">目前尚無活動照片相簿紀錄。</p>';
      return;
    }

    listEl.replaceChildren();
    albumRows.forEach((row, idx) => {
      const card = document.createElement('div');
      card.className = 'p-4 rounded-xl border border-kf-border bg-kf-bg flex flex-wrap items-start justify-between gap-3';
      const pubBadge = row.is_published
        ? '<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">已發布</span>'
        : '<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-stone-200 text-stone-700">草稿</span>';
      const urlBadge = row.flickr_album_url
        ? '<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">已連結相簿</span>'
        : '<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">待建立</span>';

      card.innerHTML = `
        <div>
          <div class="flex flex-wrap items-center gap-2 mb-1">
            ${row.event_date ? `<span class="text-xs font-semibold text-kf-walnut">${esc(row.event_date)}</span>` : ''}
            ${pubBadge}
            ${urlBadge}
          </div>
          <h4 class="text-sm font-semibold text-kf-ink m-0">${esc(row.title)}</h4>
          <p class="text-xs text-kf-inkMuted mt-1 mb-0">
            ${[row.photo_count != null ? `共 ${row.photo_count} 張照片` : '', `排序：${row.sort_order ?? 0}`].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div class="flex flex-wrap gap-1.5" data-actions></div>
      `;

      const actWrap = card.querySelector('[data-actions]');
      const mkBtn = (label, cls, onClick) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `px-2.5 py-1 rounded-lg text-xs font-medium border cursor-pointer ${cls}`;
        b.textContent = label;
        b.addEventListener('click', onClick);
        return b;
      };
      actWrap.append(
        mkBtn('編輯', 'bg-white border-kf-border text-kf-ink hover:bg-kf-sand', () => fillAlbumForm(row)),
        mkBtn(row.is_published ? '設為草稿' : '發布', 'bg-white border-kf-border text-kf-inkSoft hover:bg-kf-sand', () => togglePublish('photo_albums', row.id, !row.is_published, loadAlbumsAdmin)),
        mkBtn('上移', 'bg-white border-kf-border text-kf-inkSoft hover:bg-kf-sand', () => swapSortOrder('photo_albums', albumRows, idx, -1, loadAlbumsAdmin)),
        mkBtn('下移', 'bg-white border-kf-border text-kf-inkSoft hover:bg-kf-sand', () => swapSortOrder('photo_albums', albumRows, idx, 1, loadAlbumsAdmin)),
        mkBtn('刪除', 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100', () => deleteRow('photo_albums', row.id, row.title, loadAlbumsAdmin))
      );
      listEl.append(card);
    });
  }

  async function saveAlbumForm(e) {
    e.preventDefault();
    const client = bridge().getClient?.();
    const user = bridge().getUser?.();
    if (!client || !user) return toast('請先登入同工帳號', 'error');

    const editId = document.getElementById('albumIdInput').value.trim();
    let coverUrl = document.getElementById('albumCoverUrlInput').value.trim() || null;
    const coverFile = document.getElementById('albumCoverFileInput')?.files?.[0];
    if (coverFile) {
      const ext = coverFile.name.split('.').pop() || 'webp';
      const path = `albums/${Date.now()}.${ext}`;
      const upRes = await client.storage.from(bridge().MEDIA_BUCKET || 'cms-media').upload(path, coverFile, { upsert: false });
      if (upRes.error) return toast(`封面圖片上載失敗：${upRes.error.message}`, 'error');
      const { data: pubData } = client.storage.from(bridge().MEDIA_BUCKET || 'cms-media').getPublicUrl(path);
      coverUrl = pubData?.publicUrl || path;
    }

    const photoCountVal = document.getElementById('albumPhotoCountInput').value.trim();
    const payload = {
      title: document.getElementById('albumTitleInput').value.trim(),
      event_date: document.getElementById('albumDateInput').value || null,
      description_html: cleanHtml(albumDescQuill ? albumDescQuill.root.innerHTML : '') || null,
      flickr_album_url: document.getElementById('albumFlickrUrlInput').value.trim() || null,
      cover_photo_url: coverUrl,
      photo_count: photoCountVal ? Number(photoCountVal) : null,
      sort_order: Number(document.getElementById('albumSortOrderInput').value) || 0,
      is_published: document.getElementById('albumPublishedInput').checked
    };

    if (!editId) {
      payload.content_key = `album_${Date.now()}`;
      payload.created_by = user.id;
    }

    const { error } = editId
      ? await client.from('photo_albums').update(payload).eq('id', editId)
      : await client.from('photo_albums').insert(payload);

    if (error) return toast(`儲存活動相簿失敗：${error.message}`, 'error');
    toast('已儲存活動相簿', 'success');
    resetAlbumForm();
    await loadAlbumsAdmin();
  }

  function init() {
    if (initialized) return;
    initialized = true;
    initQuills();

    document.getElementById('rotaAdminForm')?.addEventListener('submit', saveRotaForm);
    document.getElementById('cancelRotaEditBtn')?.addEventListener('click', resetRotaForm);

    document.getElementById('sermonAdminForm')?.addEventListener('submit', saveSermonForm);
    document.getElementById('cancelSermonEditBtn')?.addEventListener('click', resetSermonForm);

    document.getElementById('albumAdminForm')?.addEventListener('submit', saveAlbumForm);
    document.getElementById('cancelAlbumEditBtn')?.addEventListener('click', resetAlbumForm);
  }

  async function refreshAll() {
    init();
    await Promise.allSettled([
      loadRotasAdmin(),
      loadSermonsAdmin(),
      loadAlbumsAdmin()
    ]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.KF_ADMIN_MEMBER_AREA = {
    refreshAll,
    loadRotasAdmin,
    loadSermonsAdmin,
    loadAlbumsAdmin
  };
})();
