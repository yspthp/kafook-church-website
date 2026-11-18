/* 五旬節聖潔會迦福堂 — 管理後台輪值表 PDF 搜尋索引提取器 (js/admin-rota-indexer.js)
 * Phase 4：客戶端 PDF.js getTextContent() 逐頁文字提取與頁碼映射
 *   - 嚴格保留 * 星號（如 吳漢暉*、梁浩軒*）與群體名稱（如 活泉之家、棋匯坊）原貌
 *   - 不進行 OCR、不摘要、不清洗或改寫文字
 *   - 若提取失敗，保留原 PDF 可正常開啟，並將 search_text 維持 NULL 及顯示警告
 */
(function () {
  'use strict';

  const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const PDFJS_WORKER_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) return resolve();
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error('無法載入 PDF.js 函式庫'));
      document.head.append(script);
    });
  }

  async function ensurePdfJs() {
    if (!window.pdfjsLib) {
      await loadScript(PDFJS_CDN);
    }
    if (window.pdfjsLib && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN;
    }
    if (!window.pdfjsLib) {
      throw new Error('PDF.js 尚未就緒');
    }
    return window.pdfjsLib;
  }

  async function extractPdfIndexFromBytes(arrayBuffer) {
    const pdfjsLib = await ensurePdfJs();
    const copy = arrayBuffer.slice(0);
    const pdf = await pdfjsLib.getDocument({ data: copy }).promise;
    const pageCount = pdf.numPages || 1;
    const pageMap = [];
    const pageTexts = [];

    for (let pageNum = 1; pageNum <= pageCount; pageNum += 1) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      // 直接串接文字項目，原樣保留星號 (*) 與群體／英文隊工名稱
      const rawItems = textContent.items.map((item) => String(item.str ?? ''));
      const pageText = rawItems.join(' ').replace(/[ \t]+/g, ' ').trim();
      pageMap.push({ page: pageNum, text: pageText });
      if (pageText) pageTexts.push(pageText);
    }

    const searchText = pageTexts.join('\n\n').trim() || null;
    return {
      pageCount,
      searchText,
      searchPageMap: searchText ? pageMap : null,
      searchIndexedAt: searchText ? new Date().toISOString() : null
    };
  }

  async function extractPdfIndexFromFile(file) {
    if (!file) throw new Error('請選擇 PDF 檔案');
    const buf = await file.arrayBuffer();
    return await extractPdfIndexFromBytes(buf);
  }

  async function fetchPdfBytesFromBucket(client, pdfPath) {
    if (!client || !pdfPath) throw new Error('此輪值表尚未上載 PDF 檔案');
    const { data, error } = await client.storage.from('member-documents').download(pdfPath);
    if (!error && data) {
      return await data.arrayBuffer();
    }
    const signed = await client.storage.from('member-documents').createSignedUrl(pdfPath, 180);
    if (signed.error || !signed.data?.signedUrl) {
      throw new Error('無法從儲存桶讀取此 PDF 檔案');
    }
    const res = await fetch(signed.data.signedUrl);
    if (!res.ok) throw new Error('讀取 PDF 檔案失敗');
    return await res.arrayBuffer();
  }

  async function rebuildRotaSearchIndex(client, doc, onStatus) {
    const notify = (msg, tone = 'muted') => {
      if (typeof onStatus === 'function') onStatus(msg, tone);
    };

    if (!doc?.pdf_path) {
      notify('此輪值表尚未上載 PDF，無法建立搜尋索引。', 'warning');
      return { ok: false, warning: '尚未上載 PDF 檔案' };
    }

    notify('正在讀取 PDF 並逐頁提取文字索引…', 'muted');
    try {
      const bytes = await fetchPdfBytesFromBucket(client, doc.pdf_path);
      const extracted = await extractPdfIndexFromBytes(bytes);

      if (!extracted.searchText) {
        await client
          .from('rota_documents')
          .update({
            page_count: extracted.pageCount,
            search_text: null,
            search_page_map: null,
            search_indexed_at: null
          })
          .eq('id', doc.id);

        const warnMsg = '此 PDF 未能提取可搜尋文字（可能為純掃描圖片檔），原檔仍可正常檢視，搜尋索引維持空白。';
        notify(warnMsg, 'warning');
        return { ok: false, pageCount: extracted.pageCount, warning: warnMsg };
      }

      const { error } = await client
        .from('rota_documents')
        .update({
          page_count: extracted.pageCount,
          search_text: extracted.searchText,
          search_page_map: extracted.searchPageMap,
          search_indexed_at: extracted.searchIndexedAt
        })
        .eq('id', doc.id);

      if (error) throw error;
      notify(`已完成搜尋索引重建（共 ${extracted.pageCount} 頁）。`, 'success');
      return { ok: true, ...extracted };
    } catch (err) {
      await client
        .from('rota_documents')
        .update({
          search_text: null,
          search_page_map: null,
          search_indexed_at: null
        })
        .eq('id', doc.id);

      const warnMsg = `重建搜尋索引失敗：${err.message || '未知錯誤'}；原 PDF 仍可正常開啟。`;
      notify(warnMsg, 'warning');
      return { ok: false, warning: warnMsg };
    }
  }

  window.KF_ROTA_INDEXER = {
    extractPdfIndexFromBytes,
    extractPdfIndexFromFile,
    rebuildRotaSearchIndex
  };
})();
