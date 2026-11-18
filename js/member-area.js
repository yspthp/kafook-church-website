/* 五旬節聖潔會迦福堂 — 會友專區擴充模組 (js/member-area.js)
 * 包含：
 *   3A. 事奉輪值表（PDF.js 畫布檢視器、原檔下載、原檔列印、關鍵字深層連結與高亮、「我的事奉」捷徑）
 *   3B. 講道錄音（SoundCloud 延遲載入播放器、講員與年份篩選、待上載狀態）
 *   3C. 活動照片（Flickr 不列出相簿嵌入檢視器、年份分組、待建立狀態）
 */
(function () {
  'use strict';

  const config = window.KF_SUPABASE_CONFIG;
  const ROTA_TYPE_LABELS = {
    sanctuary: '大堂崇拜事奉輪值表',
    youth: '青少年崇拜輪值表',
    prayer: '祈禱會輪值表',
    flowers: '插花輪值表',
    headcount: '崇拜點算人數輪值表',
    other: '其他事奉輪值表'
  };
  const ROTA_TYPE_ORDER = ['sanctuary', 'youth', 'prayer', 'flowers', 'headcount', 'other'];
  const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const PDFJS_WORKER_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const MY_SERVICE_STORAGE_KEY = 'kf_member_my_name';

  const state = {
    client: null,
    user: null,
    role: 'guest',
    rotas: [],
    sermons: [],
    albums: [],
    myServiceOnly: false,
    myServiceName: '',
    searchQuery: '',
    pdfDoc: null,
    currentRota: null,
    currentPage: 1,
    totalPages: 1,
    scale: 1.2,
    fitWidthMode: true,
    highlightTerm: '',
    currentPdfBytes: null,
    activeLoadToken: 0,
    eventsBound: false
  };

  const esc = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const rich = (value) => {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    if (window.DOMPurify) {
      return window.DOMPurify.sanitize(raw, {
        USE_PROFILES: { html: true },
        ADD_ATTR: ['target', 'rel', 'loading']
      });
    }
    const fallbackEl = document.createElement('div');
    fallbackEl.textContent = raw;
    return fallbackEl.innerHTML;
  };

  const html = (tag, attrs = {}, text = '') => {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (v !== undefined && v !== null) el.setAttribute(k, v);
    });
    if (text) el.textContent = text;
    return el;
  };

  const setStatus = (el, text, tone = 'muted') => {
    if (!el) return;
    el.textContent = text;
    el.className = `cms-status ${tone === 'error' ? 'error' : tone === 'success' ? 'success' : ''}`.trim();
  };

  const addScript = (src, readyCheck) => new Promise((resolve, reject) => {
    if (typeof readyCheck === 'function' && readyCheck()) return resolve();
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      let tries = 0;
      const timer = setInterval(() => {
        tries += 1;
        if (typeof readyCheck === 'function' && readyCheck()) {
          clearInterval(timer);
          resolve();
        } else if (tries > 100) {
          clearInterval(timer);
          reject(new Error(`載入 ${src} 逾時`));
        }
      }, 50);
      existing.addEventListener('load', () => { clearInterval(timer); resolve(); }, { once: true });
      existing.addEventListener('error', () => { clearInterval(timer); reject(new Error(`載入 ${src} 失敗`)); }, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });

  function resolveMediaUrl(photoPath, defaultBucket = 'cms-media') {
    if (!photoPath) return '';
    const trimmed = String(photoPath).trim();
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('images/')) return trimmed;
    if (state.client) {
      const { data } = state.client.storage.from(defaultBucket).getPublicUrl(trimmed);
      return data?.publicUrl || '';
    }
    return '';
  }

  async function ensurePdfJsLoaded() {
    if (window.pdfjsLib) {
      if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN;
      }
      return window.pdfjsLib;
    }
    await addScript(PDFJS_CDN, () => Boolean(window.pdfjsLib));
    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN;
    }
    return window.pdfjsLib;
  }

  /* ---------- 3A. 事奉輪值表：PDF.js 檢視器、原檔下載、原檔列印、搜尋與高亮 ---------- */
  async function fetchMemberPdfBytes(pdfPath) {
    if (!pdfPath || !state.client) throw new Error('尚未設定 PDF 儲存路徑');
    const { data, error } = await state.client.storage.from('member-documents').download(pdfPath);
    if (!error && data) {
      return await data.arrayBuffer();
    }
    const signed = await state.client.storage.from('member-documents').createSignedUrl(pdfPath, 300);
    if (signed.error || !signed.data?.signedUrl) {
      throw new Error('儲存桶中尚無此 PDF 檔案，請由同工於管理後台上載原始 PDF。');
    }
    const res = await fetch(signed.data.signedUrl);
    if (!res.ok) throw new Error('無法讀取 PDF 檔案。');
    return await res.arrayBuffer();
  }

  async function downloadOriginalRotaPdf(doc) {
    if (!doc?.pdf_path) return;
    try {
      const bytes = (state.currentRota?.id === doc.id && state.currentPdfBytes)
        ? state.currentPdfBytes
        : await fetchMemberPdfBytes(doc.pdf_path);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${doc.title}-${doc.period_label}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 15000);
    } catch (err) {
      alert(err.message || '下載 PDF 失敗，請確認檔案是否已上載至儲存桶。');
    }
  }

  async function printOriginalRotaPdf(doc) {
    if (!doc?.pdf_path) return;
    try {
      const bytes = (state.currentRota?.id === doc.id && state.currentPdfBytes)
        ? state.currentPdfBytes
        : await fetchMemberPdfBytes(doc.pdf_path);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);
      let printFrame = document.getElementById('rotaOriginalPrintFrame');
      if (printFrame) printFrame.remove();
      printFrame = document.createElement('iframe');
      printFrame.id = 'rotaOriginalPrintFrame';
      printFrame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
      printFrame.src = blobUrl;
      printFrame.addEventListener('load', () => {
        try {
          printFrame.contentWindow.focus();
          printFrame.contentWindow.print();
        } catch (_e) {
          window.open(blobUrl, '_blank', 'noopener');
        }
      });
      document.body.appendChild(printFrame);
    } catch (err) {
      alert(err.message || '列印 PDF 失敗，請確認檔案是否已上載至儲存桶。');
    }
  }

  async function renderCurrentPdfPage() {
    if (!state.pdfDoc) return;
    const canvas = document.getElementById('rotaPdfCanvas');
    const textLayer = document.getElementById('rotaTextLayer');
    const viewportWrap = document.getElementById('rotaCanvasViewport');
    const pageIndicator = document.getElementById('rotaPageIndicator');
    const zoomIndicator = document.getElementById('rotaZoomIndicator');
    const prevBtn = document.getElementById('rotaPrevPageBtn');
    const nextBtn = document.getElementById('rotaNextPageBtn');
    const banner = document.getElementById('rotaViewerHighlightBanner');
    if (!canvas || !textLayer || !viewportWrap) return;

    const pageNum = Math.min(Math.max(1, state.currentPage), state.totalPages);
    state.currentPage = pageNum;
    const pdfPage = await state.pdfDoc.getPage(pageNum);

    const baseViewport = pdfPage.getViewport({ scale: 1 });
    if (state.fitWidthMode) {
      const availWidth = Math.max(280, viewportWrap.clientWidth - 48);
      state.scale = Math.min(2.2, Math.max(0.6, availWidth / baseViewport.width));
    }

    const viewport = pdfPage.getViewport({ scale: state.scale });
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    const stage = document.getElementById('rotaPageStage');
    if (stage) {
      stage.style.width = `${Math.floor(viewport.width)}px`;
      stage.style.height = `${Math.floor(viewport.height)}px`;
    }

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    await pdfPage.render({ canvasContext: ctx, viewport }).promise;

    if (pageIndicator) pageIndicator.textContent = `第 ${pageNum} / ${state.totalPages} 頁`;
    if (zoomIndicator) zoomIndicator.textContent = `${Math.round(state.scale * 100)}%`;
    if (prevBtn) prevBtn.disabled = pageNum <= 1;
    if (nextBtn) nextBtn.disabled = pageNum >= state.totalPages;

    textLayer.replaceChildren();
    const term = String(state.highlightTerm || '').trim();
    if (term) {
      const textContent = await pdfPage.getTextContent();
      const termLower = term.toLowerCase();
      let matchCount = 0;
      let firstMark = null;

      textContent.items.forEach((item) => {
        const str = String(item.str || '');
        if (!str || !str.toLowerCase().includes(termLower)) return;
        matchCount += 1;
        const tx = window.pdfjsLib.Util.transform(viewport.transform, item.transform);
        const fontHeight = Math.hypot(tx[2], tx[3]) || 14;
        const width = (item.width ? item.width * state.scale : Math.max(24, str.length * fontHeight * 0.7));
        const left = tx[4] - 2;
        const top = tx[5] - fontHeight - 2;

        const mark = html('mark', {
          class: 'rota-pdf-highlight',
          style: `left:${Math.max(0, Math.round(left))}px;top:${Math.max(0, Math.round(top))}px;width:${Math.round(width + 4)}px;height:${Math.round(fontHeight + 6)}px;`
        });
        textLayer.append(mark);
        if (!firstMark) firstMark = mark;
      });

      if (banner) {
        banner.classList.remove('is-hidden');
        banner.textContent = matchCount > 0
          ? `已為你標示本頁內的「${term}」（共 ${matchCount} 處）。`
          : `已開啟第 ${pageNum} 頁（搜尋關鍵字：「${term}」）。`;
      }
      if (firstMark) {
        firstMark.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } else if (banner) {
      banner.classList.add('is-hidden');
      banner.textContent = '';
    }
  }

  function resetRotaViewerState() {
    state.pdfDoc = null;
    state.currentRota = null;
    state.currentPdfBytes = null;
    state.highlightTerm = '';
    state.currentPage = 1;
    state.totalPages = 1;
    state.fitWidthMode = true;

    const canvas = document.getElementById('rotaPdfCanvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.width = 0;
      canvas.height = 0;
      canvas.style.width = '0px';
      canvas.style.height = '0px';
    }
    const stage = document.getElementById('rotaPageStage');
    if (stage) {
      stage.style.width = '0px';
      stage.style.height = '0px';
    }
    document.getElementById('rotaTextLayer')?.replaceChildren();

    const banner = document.getElementById('rotaViewerHighlightBanner');
    if (banner) {
      banner.classList.add('is-hidden');
      banner.textContent = '';
    }
    const pageInd = document.getElementById('rotaPageIndicator');
    if (pageInd) pageInd.textContent = '第 — / — 頁';
    const zoomInd = document.getElementById('rotaZoomIndicator');
    if (zoomInd) zoomInd.textContent = '—';
    const prevBtn = document.getElementById('rotaPrevPageBtn');
    const nextBtn = document.getElementById('rotaNextPageBtn');
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
  }

  async function openRotaPdfViewer(doc, targetPage = 1, highlightTerm = '') {
    const modal = document.getElementById('rotaPdfViewerModal');
    const titleEl = document.getElementById('rotaViewerTitle');
    const metaEl = document.getElementById('rotaViewerMeta');
    const statusEl = document.getElementById('rotaViewerStatus');
    const notesEl = document.getElementById('rotaViewerNotes');
    const viewportWrap = document.getElementById('rotaCanvasViewport');
    if (!modal || !doc) return;

    const loadToken = ++state.activeLoadToken;
    resetRotaViewerState();
    if (viewportWrap) viewportWrap.classList.add('is-hidden');

    modal.classList.remove('is-hidden');
    modal.scrollIntoView({ behavior: 'smooth', block: 'start' });

    if (titleEl) titleEl.textContent = `${doc.title}（${doc.period_label}）`;
    const metaParts = [];
    if (doc.updated_on_label) metaParts.push(`最後更新：${doc.updated_on_label}`);
    if (doc.page_count) metaParts.push(`共 ${doc.page_count} 頁`);
    if (metaEl) metaEl.textContent = metaParts.join(' · ');

    if (notesEl) {
      const cleanNotes = rich(doc.notes_html || '');
      if (cleanNotes) {
        notesEl.innerHTML = `<strong>輪值表備註：</strong>${cleanNotes}`;
        notesEl.classList.remove('is-hidden');
      } else {
        notesEl.innerHTML = '';
        notesEl.classList.add('is-hidden');
      }
    }

    const expectedPath = String(doc.pdf_path || '').trim();
    if (!expectedPath) {
      if (statusEl) {
        statusEl.classList.remove('is-hidden');
        setStatus(statusEl, '此期輪值表尚未上載原始 PDF 檔案，目前無法預覽。', 'muted');
      }
      return;
    }

    if (statusEl) {
      statusEl.classList.remove('is-hidden');
      setStatus(statusEl, '正在載入原始 PDF 檔案…', 'muted');
    }

    try {
      const pdfjsLib = await ensurePdfJsLoaded();
      const loadedPath = expectedPath;
      const bytes = await fetchMemberPdfBytes(loadedPath);

      // 完整性檢查：確保載入中未切換文件，且載入路徑與該筆輪值表之 pdf_path 完全一致
      if (loadToken !== state.activeLoadToken || loadedPath !== String(doc.pdf_path || '').trim()) {
        resetRotaViewerState();
        if (viewportWrap) viewportWrap.classList.add('is-hidden');
        return;
      }

      const loadingTask = pdfjsLib.getDocument({ data: bytes.slice(0) });
      const pdfDoc = await loadingTask.promise;

      if (loadToken !== state.activeLoadToken || loadedPath !== String(doc.pdf_path || '').trim()) {
        resetRotaViewerState();
        if (viewportWrap) viewportWrap.classList.add('is-hidden');
        return;
      }

      state.currentPdfBytes = bytes.slice(0);
      state.currentRota = doc;
      state.pdfDoc = pdfDoc;
      state.highlightTerm = highlightTerm || '';
      state.fitWidthMode = true;
      state.totalPages = pdfDoc.numPages || 1;
      state.currentPage = Math.min(Math.max(1, Number(targetPage) || 1), state.totalPages);

      if (statusEl) statusEl.classList.add('is-hidden');
      if (viewportWrap) viewportWrap.classList.remove('is-hidden');
      await renderCurrentPdfPage();
    } catch (_err) {
      if (loadToken !== state.activeLoadToken) return;
      resetRotaViewerState();
      if (viewportWrap) viewportWrap.classList.add('is-hidden');
      if (statusEl) {
        statusEl.classList.remove('is-hidden');
        setStatus(statusEl, '此期輪值表尚未於儲存桶找到對應 PDF 檔案，目前無法預覽（請由同工於管理後台上載）。', 'error');
      }
    }
  }

  function findRotaMatches(term) {
    const q = String(term || '').trim();
    if (!q) return [];
    const qLower = q.toLowerCase();
    const hits = [];

    state.rotas.forEach((doc) => {
      if (!doc.search_text) return;
      const pages = Array.isArray(doc.search_page_map) && doc.search_page_map.length
        ? doc.search_page_map
        : [{ page: 1, text: doc.search_text }];

      pages.forEach((pObj) => {
        const pageText = String(pObj?.text || '');
        if (pageText.toLowerCase().includes(qLower)) {
          hits.push({
            doc,
            page: Number(pObj.page) || 1,
            term: q
          });
        }
      });
    });
    return hits;
  }

  function renderRotaSearchResults(term) {
    const box = document.getElementById('rotaSearchResults');
    const clearBtn = document.getElementById('rotaSearchClearBtn');
    if (!box) return;

    const q = String(term || '').trim();
    if (clearBtn) clearBtn.classList.toggle('is-hidden', !q);

    if (!q) {
      box.classList.add('is-hidden');
      box.replaceChildren();
      return;
    }

    box.classList.remove('is-hidden');
    box.replaceChildren();

    const hits = findRotaMatches(q);
    const title = html('p', { class: 'member-search-results-title' },
      hits.length
        ? `搜尋「${q}」共找到 ${hits.length} 筆結果（點選即可開啟該頁 PDF 並標示關鍵字）：`
        : `在已建立索引的輪值表中找不到「${q}」。`
    );
    box.append(title);

    if (hits.length) {
      const ul = html('ul', { class: 'member-search-hit-list' });
      hits.forEach((hit) => {
        const li = html('li');
        const btn = html('button', { type: 'button', class: 'member-search-hit-btn' });
        const labelText = `「${hit.term}」見於《${hit.doc.title} ${hit.doc.period_label}》第 ${hit.page} 頁`;
        btn.append(
          html('span', {}, labelText),
          html('span', { class: 'text-link' }, '開啟檢視 →')
        );
        btn.addEventListener('click', () => {
          openRotaPdfViewer(hit.doc, hit.page, hit.term);
        });
        li.append(btn);
        ul.append(li);
      });
      box.append(ul);
    }
  }

  function renderRotaGroups() {
    const container = document.getElementById('memberRotasList');
    if (!container) return;

    if (!state.rotas.length) {
      container.replaceChildren(html('p', { class: 'cms-status' }, '目前尚無已發布的事奉輪值表。'));
      return;
    }

    const filterTerm = state.myServiceOnly ? String(state.myServiceName || '').trim() : '';
    const filterLower = filterTerm.toLowerCase();

    container.replaceChildren();
    container.setAttribute('data-source', 'supabase');

    let anyRendered = false;

    ROTA_TYPE_ORDER.forEach((rType) => {
      let groupDocs = state.rotas.filter((d) => (d.rota_type || 'other') === rType);
      if (filterLower) {
        groupDocs = groupDocs.filter((d) => String(d.search_text || '').toLowerCase().includes(filterLower));
      }
      if (!groupDocs.length) return;

      anyRendered = true;
      groupDocs.sort((a, b) => {
        const da = String(a.period_start || '');
        const db = String(b.period_start || '');
        if (da !== db) return db.localeCompare(da);
        return (a.sort_order || 0) - (b.sort_order || 0);
      });

      const groupSec = html('div', { class: 'member-rota-group' });
      groupSec.append(html('h3', { class: 'member-rota-group-title' }, ROTA_TYPE_LABELS[rType] || '其他事奉輪值表'));

      const grid = html('div', { class: 'member-rota-cards' });
      groupDocs.forEach((doc) => {
        const card = html('article', { class: 'member-rota-card' });
        const top = html('div', { class: 'member-rota-card-top' });
        top.append(
          html('span', { class: 'member-rota-period-badge' }, doc.period_label || '期別待補'),
          html('h4', {}, doc.title)
        );

        const meta = html('div', { class: 'member-rota-meta' });
        if (doc.updated_on_label) meta.append(html('span', {}, `最後更新：${doc.updated_on_label}`));
        if (doc.page_count) meta.append(html('span', {}, `共 ${doc.page_count} 頁`));
        if (meta.childNodes.length) top.append(meta);

        if (!doc.search_text) {
          top.append(html('p', { class: 'member-rota-unindexed' }, '此輪值表尚未建立搜尋索引，但仍可直接開啟檢視 PDF。'));
        }

        const actions = html('div', { class: 'member-rota-actions' });
        const activeTerm = filterTerm || String(state.searchQuery || '').trim();

        if (doc.pdf_path) {
          const openBtn = html('button', { type: 'button', class: 'member-tool-btn primary' }, '檢視 PDF');
          openBtn.addEventListener('click', () => openRotaPdfViewer(doc, 1, activeTerm));

          const dlBtn = html('button', { type: 'button', class: 'member-tool-btn' }, '下載 PDF');
          dlBtn.addEventListener('click', () => downloadOriginalRotaPdf(doc));

          const printBtn = html('button', { type: 'button', class: 'member-tool-btn' }, '列印');
          printBtn.addEventListener('click', () => printOriginalRotaPdf(doc));

          actions.append(openBtn, dlBtn, printBtn);
        } else {
          actions.append(html('span', { class: 'member-badge pending', 'data-pending': 'rota-pdf-pending' }, '待上載 PDF'));
        }

        card.append(top, actions);
        grid.append(card);
      });

      groupSec.append(grid);
      container.append(groupSec);
    });

    if (!anyRendered) {
      container.append(html('p', { class: 'cms-status' }, `在已建立索引的輪值表中找不到「${filterTerm}」的事奉紀錄。`));
    }
  }

  async function loadMemberRotas() {
    const container = document.getElementById('memberRotasList');
    if (!container || !state.client) return;
    try {
      const { data, error } = await state.client
        .from('rota_documents')
        .select('*')
        .eq('is_published', true)
        .order('period_start', { ascending: false })
        .order('sort_order', { ascending: true });

      if (error) throw error;
      state.rotas = Array.isArray(data) ? data : [];
      renderRotaGroups();
      if (state.myServiceOnly && state.myServiceName) {
        renderRotaSearchResults(state.myServiceName);
      } else if (state.searchQuery) {
        renderRotaSearchResults(state.searchQuery);
      }
    } catch (_err) {
      container.replaceChildren(html('p', { class: 'cms-status error' }, '目前暫時無法載入事奉輪值表，請稍後再試。'));
    }
  }

  /* ---------- 3B. 講道錄音 ---------- */
  function populateSermonFilters() {
    const speakerSel = document.getElementById('sermonSpeakerFilter');
    const yearSel = document.getElementById('sermonYearFilter');
    if (!speakerSel || !yearSel) return;

    const currentSpeaker = speakerSel.value;
    const currentYear = yearSel.value;

    const speakers = [...new Set(state.sermons.map((s) => String(s.speaker || '').trim()).filter(Boolean))];
    const years = [...new Set(state.sermons.map((s) => String(s.sermon_date || '').slice(0, 4)).filter((y) => /^\d{4}$/.test(y)))].sort((a, b) => b.localeCompare(a));

    speakerSel.replaceChildren(html('option', { value: '' }, '全部講員'));
    speakers.forEach((sp) => speakerSel.append(html('option', { value: sp }, sp)));
    speakerSel.value = speakers.includes(currentSpeaker) ? currentSpeaker : '';

    yearSel.replaceChildren(html('option', { value: '' }, '全部年份'));
    years.forEach((yr) => yearSel.append(html('option', { value: yr }, `${yr} 年`)));
    yearSel.value = years.includes(currentYear) ? currentYear : '';
  }

  function renderMemberSermons() {
    const container = document.getElementById('memberSermonsList');
    if (!container) return;

    const speakerFilter = document.getElementById('sermonSpeakerFilter')?.value || '';
    const yearFilter = document.getElementById('sermonYearFilter')?.value || '';

    const filtered = state.sermons.filter((s) => {
      if (speakerFilter && String(s.speaker || '').trim() !== speakerFilter) return false;
      if (yearFilter && !String(s.sermon_date || '').startsWith(yearFilter)) return false;
      return true;
    });

    container.replaceChildren();
    container.setAttribute('data-source', 'supabase');

    if (!filtered.length) {
      container.append(html('p', { class: 'cms-status' }, '目前沒有符合篩選條件的講道錄音。'));
      return;
    }

    const table = html('table', { class: 'member-sermon-table', 'aria-label': '講道錄音列表' });
    const thead = html('thead');
    const headRow = html('tr');
    ['日期', '講員', '講題', '收聽'].forEach((col) => headRow.append(html('th', { scope: 'col' }, col)));
    thead.append(headRow);

    const tbody = html('tbody');
    filtered.forEach((item) => {
      const tr = html('tr');
      const dateStr = item.sermon_date || '';
      const speakerStr = item.speaker || '（講員待補）';

      const titleTd = html('td');
      titleTd.append(html('strong', {}, item.title || '（講題待補）'));
      const subParts = [item.scripture, item.series, item.duration_label].filter(Boolean);
      if (subParts.length) {
        titleTd.append(html('span', { class: 'member-sermon-sub' }, subParts.join(' · ')));
      }

      const actionTd = html('td');
      const scUrl = String(item.soundcloud_url || '').trim();
      let playerRow = null;

      if (scUrl && /^https?:\/\//i.test(scUrl)) {
        const toggleBtn = html('button', {
          type: 'button',
          class: 'member-tool-btn primary',
          'aria-expanded': 'false'
        }, '展開收聽');

        playerRow = html('tr', { class: 'member-sermon-player-row is-hidden' });
        const playerCell = html('td', { colspan: '4' });
        playerRow.append(playerCell);

        toggleBtn.addEventListener('click', () => {
          const isOpen = !playerRow.classList.contains('is-hidden');
          if (isOpen) {
            playerRow.classList.add('is-hidden');
            playerCell.replaceChildren();
            toggleBtn.setAttribute('aria-expanded', 'false');
            toggleBtn.textContent = '展開收聽';
          } else {
            playerRow.classList.remove('is-hidden');
            toggleBtn.setAttribute('aria-expanded', 'true');
            toggleBtn.textContent = '收起播放器';
            if (!playerCell.querySelector('iframe')) {
              const widgetUrl = `https://w.soundcloud.com/player/?url=${encodeURIComponent(scUrl)}&color=%234A3526&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false`;
              const iframe = html('iframe', {
                title: `${dateStr} ${speakerStr} 講道錄音播放器`,
                width: '100%',
                height: '166',
                scrolling: 'no',
                frameborder: 'no',
                allow: 'autoplay',
                src: widgetUrl
              });
              playerCell.append(iframe);
            }
          }
        });
        actionTd.append(toggleBtn);
      } else {
        actionTd.append(html('span', { class: 'member-badge pending', 'data-pending': 'sermon-audio-pending' }, '待上載'));
      }

      tr.append(
        html('td', {}, dateStr),
        html('td', {}, speakerStr),
        titleTd,
        actionTd
      );
      tbody.append(tr);
      if (playerRow) tbody.append(playerRow);
    });

    table.append(thead, tbody);
    container.append(table);
  }

  async function loadMemberSermons() {
    const container = document.getElementById('memberSermonsList');
    if (!container || !state.client) return;
    try {
      const { data, error } = await state.client
        .from('sermons')
        .select('*')
        .eq('is_published', true)
        .order('sermon_date', { ascending: false })
        .order('sort_order', { ascending: true });

      if (error) throw error;
      state.sermons = Array.isArray(data) ? data : [];
      populateSermonFilters();
      renderMemberSermons();
    } catch (_err) {
      container.replaceChildren(html('p', { class: 'cms-status error' }, '目前暫時無法載入講道錄音，請稍後再試。'));
    }
  }

  /* ---------- 3C. 活動照片 ---------- */
  function openPhotoAlbumViewer(album) {
    const viewer = document.getElementById('memberPhotoViewer');
    const titleEl = document.getElementById('photoViewerTitle');
    const metaEl = document.getElementById('photoViewerMeta');
    const extLink = document.getElementById('photoViewerExternalLink');
    const frameWrap = document.getElementById('photoViewerFrameWrap');
    const descEl = document.getElementById('photoViewerDesc');
    if (!viewer || !frameWrap) return;

    const rawUrl = String(album.flickr_album_url || '').trim();
    if (!rawUrl) return;

    viewer.classList.remove('is-hidden');
    viewer.scrollIntoView({ behavior: 'smooth', block: 'start' });

    if (titleEl) titleEl.textContent = album.title || '活動相簿';
    const metaParts = [];
    if (album.event_date) metaParts.push(album.event_date);
    if (album.photo_count) metaParts.push(`共 ${album.photo_count} 張照片`);
    if (metaEl) metaEl.textContent = metaParts.join(' · ');
    if (extLink) extLink.href = rawUrl;

    const embedSrc = rawUrl.endsWith('/player') || rawUrl.includes('/player/')
      ? rawUrl
      : `${rawUrl.replace(/\/+$/, '')}/player`;

    frameWrap.replaceChildren(html('iframe', {
      title: `${album.title || '活動相簿'} Flickr 嵌入檢視器`,
      src: embedSrc,
      allowfullscreen: 'true',
      webkitallowfullscreen: 'true',
      mozallowfullscreen: 'true'
    }));

    if (descEl) {
      const cleanDesc = rich(album.description_html || '');
      if (cleanDesc) {
        descEl.innerHTML = cleanDesc;
        descEl.classList.remove('is-hidden');
      } else {
        descEl.innerHTML = '';
        descEl.classList.add('is-hidden');
      }
    }
  }

  function renderMemberPhotos() {
    const container = document.getElementById('memberPhotosList');
    if (!container) return;

    container.replaceChildren();
    container.setAttribute('data-source', 'supabase');

    if (!state.albums.length) {
      container.append(html('p', {
        class: 'cms-status',
        'data-pending': 'photo-albums-pending'
      }, '目前尚無已發布的活動照片相簿（待建立）。'));
      return;
    }

    const byYear = new Map();
    state.albums.forEach((album) => {
      const yr = album.event_date ? String(album.event_date).slice(0, 4) : '其他年份';
      const label = /^\d{4}$/.test(yr) ? `${yr} 年` : '其他年份';
      if (!byYear.has(label)) byYear.set(label, []);
      byYear.get(label).push(album);
    });

    byYear.forEach((albums, yearLabel) => {
      const yearSec = html('div', { class: 'member-photo-year-group' });
      yearSec.append(html('h3', { class: 'member-rota-group-title' }, yearLabel));

      const grid = html('div', { class: 'member-photo-grid' });
      albums.forEach((album) => {
        const card = html('article', { class: 'member-photo-card' });
        const cover = html('div', { class: 'member-photo-cover' });
        const coverSrc = resolveMediaUrl(album.cover_photo_url) || 'images/placeholders/neutral-photo.svg';
        cover.append(html('img', {
          src: coverSrc,
          alt: album.title || '活動相簿封面',
          loading: 'lazy'
        }));

        const body = html('div', { class: 'member-photo-body' });
        body.append(html('h4', { style: 'margin:0;color:var(--kf-primary);' }, album.title));
        const meta = html('div', { class: 'member-rota-meta' });
        if (album.event_date) meta.append(html('span', {}, album.event_date));
        if (album.photo_count != null) meta.append(html('span', {}, `共 ${album.photo_count} 張照片`));
        if (meta.childNodes.length) body.append(meta);

        if (album.description_html) {
          const desc = html('div', { class: 'cms-rich-content', style: 'font-size:0.88rem;color:var(--kf-text-muted);' });
          desc.innerHTML = rich(album.description_html);
          body.append(desc);
        }

        const actions = html('div', { class: 'member-rota-actions', style: 'margin-top:auto;' });
        if (album.flickr_album_url && /^https?:\/\//i.test(String(album.flickr_album_url).trim())) {
          const openBtn = html('button', { type: 'button', class: 'member-tool-btn primary' }, '瀏覽相簿');
          openBtn.addEventListener('click', () => openPhotoAlbumViewer(album));
          actions.append(openBtn);
        } else {
          actions.append(html('span', { class: 'member-badge pending' }, '待建立'));
        }
        body.append(actions);
        card.append(cover, body);
        grid.append(card);
      });

      yearSec.append(grid);
      container.append(yearSec);
    });
  }

  async function loadMemberPhotos() {
    const container = document.getElementById('memberPhotosList');
    if (!container || !state.client) return;
    try {
      const { data, error } = await state.client
        .from('photo_albums')
        .select('*')
        .eq('is_published', true)
        .order('event_date', { ascending: false })
        .order('sort_order', { ascending: true });

      if (error) throw error;
      state.albums = Array.isArray(data) ? data : [];
      renderMemberPhotos();
    } catch (_err) {
      container.replaceChildren(html('p', { class: 'cms-status error' }, '目前暫時無法載入活動照片相簿，請稍後再試。'));
    }
  }

  /* ---------- 事件綁定與登入狀態同步 ---------- */
  function bindEvents() {
    if (state.eventsBound) return;
    state.eventsBound = true;

    const savedName = localStorage.getItem(MY_SERVICE_STORAGE_KEY) || '';
    state.myServiceName = savedName;
    const myInput = document.getElementById('myServiceNameInput');
    if (myInput) myInput.value = savedName;

    const searchInput = document.getElementById('rotaSearchInput');
    const searchBtn = document.getElementById('rotaSearchBtn');
    const clearBtn = document.getElementById('rotaSearchClearBtn');
    const myToggleBtn = document.getElementById('myServiceToggleBtn');

    const triggerSearch = () => {
      const q = String(searchInput?.value || '').trim();
      state.searchQuery = q;
      renderRotaSearchResults(q);
    };

    searchBtn?.addEventListener('click', triggerSearch);
    searchInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        triggerSearch();
      }
    });
    searchInput?.addEventListener('input', () => {
      if (!searchInput.value.trim()) {
        state.searchQuery = '';
        renderRotaSearchResults('');
      }
    });
    clearBtn?.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      state.searchQuery = '';
      renderRotaSearchResults('');
    });

    myInput?.addEventListener('input', () => {
      const val = String(myInput.value || '').trim();
      state.myServiceName = val;
      try {
        if (val) localStorage.setItem(MY_SERVICE_STORAGE_KEY, val);
        else localStorage.removeItem(MY_SERVICE_STORAGE_KEY);
      } catch (_e) {}
      if (state.myServiceOnly) {
        renderRotaGroups();
        renderRotaSearchResults(val);
      }
    });

    myToggleBtn?.addEventListener('click', () => {
      const val = String(myInput?.value || '').trim();
      if (!val && !state.myServiceOnly) {
        myInput?.focus();
        return;
      }
      state.myServiceOnly = !state.myServiceOnly;
      myToggleBtn.setAttribute('aria-pressed', state.myServiceOnly ? 'true' : 'false');
      myToggleBtn.textContent = state.myServiceOnly ? '顯示全部輪值表' : '只看我的事奉';
      renderRotaGroups();
      if (state.myServiceOnly) {
        renderRotaSearchResults(val);
      } else {
        renderRotaSearchResults(state.searchQuery);
      }
    });

    document.getElementById('rotaPrevPageBtn')?.addEventListener('click', async () => {
      if (state.currentPage > 1) {
        state.currentPage -= 1;
        await renderCurrentPdfPage();
      }
    });
    document.getElementById('rotaNextPageBtn')?.addEventListener('click', async () => {
      if (state.currentPage < state.totalPages) {
        state.currentPage += 1;
        await renderCurrentPdfPage();
      }
    });
    document.getElementById('rotaZoomOutBtn')?.addEventListener('click', async () => {
      state.fitWidthMode = false;
      state.scale = Math.max(0.5, Math.round((state.scale - 0.2) * 100) / 100);
      await renderCurrentPdfPage();
    });
    document.getElementById('rotaZoomInBtn')?.addEventListener('click', async () => {
      state.fitWidthMode = false;
      state.scale = Math.min(3.0, Math.round((state.scale + 0.2) * 100) / 100);
      await renderCurrentPdfPage();
    });
    document.getElementById('rotaFitWidthBtn')?.addEventListener('click', async () => {
      state.fitWidthMode = true;
      await renderCurrentPdfPage();
    });
    document.getElementById('rotaDownloadBtn')?.addEventListener('click', () => {
      if (state.currentRota) downloadOriginalRotaPdf(state.currentRota);
    });
    document.getElementById('rotaPrintBtn')?.addEventListener('click', () => {
      if (state.currentRota) printOriginalRotaPdf(state.currentRota);
    });
    document.getElementById('rotaCloseViewerBtn')?.addEventListener('click', () => {
      resetRotaViewerState();
      document.getElementById('rotaPdfViewerModal')?.classList.add('is-hidden');
    });

    document.getElementById('sermonSpeakerFilter')?.addEventListener('change', renderMemberSermons);
    document.getElementById('sermonYearFilter')?.addEventListener('change', renderMemberSermons);

    document.getElementById('photoViewerCloseBtn')?.addEventListener('click', () => {
      const viewer = document.getElementById('memberPhotoViewer');
      const wrap = document.getElementById('photoViewerFrameWrap');
      viewer?.classList.add('is-hidden');
      wrap?.replaceChildren();
    });
  }

  function clearMemberDataOnLogout() {
    state.rotas = [];
    state.sermons = [];
    state.albums = [];
    resetRotaViewerState();
    document.getElementById('rotaPdfViewerModal')?.classList.add('is-hidden');
    document.getElementById('memberPhotoViewer')?.classList.add('is-hidden');
    document.getElementById('rotaSearchResults')?.classList.add('is-hidden');
    const rList = document.getElementById('memberRotasList');
    const sList = document.getElementById('memberSermonsList');
    const pList = document.getElementById('memberPhotosList');
    if (rList) rList.replaceChildren();
    if (sList) sList.replaceChildren();
    if (pList) pList.replaceChildren();
  }

  async function syncRoleAndLoad(user) {
    state.user = user;
    state.role = 'guest';
    if (!user || !state.client) {
      clearMemberDataOnLogout();
      return;
    }
    try {
      const { data } = await state.client.from('profiles').select('role').eq('id', user.id).maybeSingle();
      state.role = data?.role || 'member';
    } catch (_e) {
      state.role = 'member';
    }
    await Promise.allSettled([
      loadMemberRotas(),
      loadMemberSermons(),
      loadMemberPhotos()
    ]);
  }

  async function bootMemberArea() {
    bindEvents();
    if (!config?.url || !config?.anonKey) {
      ['memberRotasList', 'memberSermonsList', 'memberPhotosList'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) setStatus(el, '目前暫時無法連線至會友資料庫，請稍後再試。', 'error');
      });
      return;
    }

    try {
      if (!window.supabase) await addScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', () => Boolean(window.supabase));
      if (!window.DOMPurify) await addScript('https://cdn.jsdelivr.net/npm/dompurify@3.1.7/dist/purify.min.js', () => Boolean(window.DOMPurify));

      state.client = window.supabase.createClient(config.url, config.anonKey);
      const { data } = await state.client.auth.getSession();
      await syncRoleAndLoad(data.session?.user || null);

      state.client.auth.onAuthStateChange((_event, session) => {
        syncRoleAndLoad(session?.user || null);
      });
    } catch (err) {
      console.error('[KF Member Area]', err);
      ['memberRotasList', 'memberSermonsList', 'memberPhotosList'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) setStatus(el, '目前暫時無法連線至會友資料庫，請稍後再試。', 'error');
      });
    }
  }

  bootMemberArea();
})();
