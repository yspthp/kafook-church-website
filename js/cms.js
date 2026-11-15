/* Ka Fook dynamic content, auth, member area and public Supabase loaders (Warm Timber + DOMPurify XSS protection). */
(function () {
  'use strict';
  const config = window.KF_SUPABASE_CONFIG;
  const rawPage = location.pathname.split('/').pop() || 'index.html';
  const page = rawPage === '' ? 'index.html' : rawPage;
  const state = { client: null, user: null, role: 'guest', displayName: '' };

  const esc = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const fmt = (value) => (value ? new Intl.DateTimeFormat('zh-HK', { dateStyle: 'medium' }).format(new Date(value)) : '');

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

  function makeRichNode(htmlStr, plainFallback) {
    const body = html('div', { class: 'cms-rich-content' });
    const source = (htmlStr && String(htmlStr).trim() && String(htmlStr).trim() !== '<p><br></p>')
      ? String(htmlStr)
      : String(plainFallback ?? '');
    body.innerHTML = rich(source);
    body.querySelectorAll('a[target="_blank"]').forEach((a) => {
      a.setAttribute('rel', 'noopener noreferrer');
    });
    body.querySelectorAll('img').forEach((img) => {
      img.setAttribute('loading', 'lazy');
    });
    return body;
  }

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
    el.dataset.tone = tone;
  };

  const addScript = (src) => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });

  /* ---------- 1. 堂會歷史漸進式披露 (about.html) ---------- */
  const SEED_HISTORY_MILESTONES = [
    { year_label: '1968', sort_year: 1968, sort_order: 10, title: '慈雲山開基', detail_html: '<p>1966年借用慈雲山一間醫務所作聚會地點，1968年正式成立「五旬節聖潔會慈雲山堂」，初期聚會人數只有十多人。</p>' },
    { year_label: '1969', sort_year: 1969, sort_order: 20, title: '永光小學時期', detail_html: '<p>遷入五旬節聖潔會第二永光學校，以學校作為福音工作的重要平台。七十至八十年代以小學生佈道為主要發展方向；至八十年代末，聚會人數增長至接近二百人，教會經濟亦漸趨穩定。</p>' },
    { year_label: '1995–1996', sort_year: 1995, sort_order: 30, title: '首次置業・更名迦福堂', detail_html: '<p>因應慈雲山區重建，教會成立「建堂委員會」，由等待政府安置轉向自行置業。1995年購入九龍城嘉福閣閣樓單位；1996年正式進駐九龍城，並因地域遷移改名為「五旬節聖潔會迦福堂」。</p>' },
    { year_label: '1999', sort_year: 1999, sort_order: 40, title: '青年架構重組', detail_html: '<p>原有高中團契彼得團及初中團契約翰團，重組為大專團契「彼得之家」，以及少年團「Teen家」及「豐盛之家」，確立以學生工作作為福音發展主幹。</p>' },
    { year_label: '2002', sort_year: 2002, sort_order: 50, title: '落戶觀塘', detail_html: '<p>因聚會空間不敷應用，遷往觀塘道410號觀點中心12樓，展開觀塘區的長遠服侍。</p>' },
    { year_label: '2006', sort_year: 2006, sort_order: 60, title: '分家與小組牧養', detail_html: '<p>成立雅比斯之家並推行小組牧養；拓展大專團契安得烈團，由彼得之家分為雲彩之家、懷道之家、恩火之家及傳光之家；少年團分為錫安之家、甘霖之家、曙光之家、薪火之家及基石之家。</p>' },
    { year_label: '2007–2008', sort_year: 2007, sort_order: 70, title: '入校工作與首支隊工', detail_html: '<p>2007年與東華三院呂潤財紀念中學合辦香港基督少年軍，開展將軍澳入校工作。2008年成立本堂第一支隊工「恩冕籃球隊」。</p>' },
    { year_label: '2011', sort_year: 2011, sort_order: 80, title: '棋匯坊成立', detail_html: '<p>成立隊工「棋匯坊」，以板棋作為傳福音媒介，藉活動與新朋友建立關係。</p>' },
    { year_label: '2012', sort_year: 2012, sort_order: 90, title: '諾知原開辦', detail_html: '<p>於將軍澳慧安商場開辦「諾知原教育中心」（Promised Land），以補習班及興趣班接觸區內學生。同年於迦密主恩中學開展學生信仰小組，並首次舉辦柬埔寨短宣團。</p>' },
    { year_label: '2013–2016', sort_year: 2013, sort_order: 100, title: '傳恩之家與入校資助', detail_html: '<p>2013年成立傳恩之家，作為中學文憑試考生及大專生的牧養群體；同年獲教育局區本計劃資助，與高雷中學合作舉辦課程。至2016年已與觀塘及將軍澳區五所中學建立合作，包括高雷中學、新生命教育協會呂郭碧鳳中學、聖安當女書院、東華三院呂潤財紀念中學及迦密主恩中學，透過學術課程、功課輔導及義工訓練等接觸逾百名中學生。</p>' },
    { year_label: '2016', sort_year: 2016, sort_order: 110, title: '提摩太團成立', detail_html: '<p>成立活泉之家，與傳恩之家合組成「提摩太團」，聚焦大專生活中的信仰挑戰與大專校園福音工作。</p>' },
    { year_label: '2017', sort_year: 2017, sort_order: 120, title: '小組化牧養與建堂起步', detail_html: '<p>安得烈團重組為六個小組：申命、因愛、葡萄園、傳愛、恩悅、承命，其中申命及因愛為夫婦小組，其餘為職青小組；少年團重組為揚光之家及使命之家。同年11月購入觀塘成業街10號電訊一代廣場23樓C2室，並啟動「天國小錢」建堂捐獻計劃。</p>' },
    { year_label: '2018', sort_year: 2018, sort_order: 130, title: '五十週年堂慶', detail_html: '<p>推動「全堂合一佈道運動」及相關堂慶活動，總結多年來的組織發展與福音外展。</p>' },
    { year_label: '2024–2026', sort_year: 2024, sort_order: 140, title: '新堂啟用', detail_html: '<p>2024年啟動「天國小錢2025」建堂捐獻計劃；2025年購置新堂物業；2026年1月25日舉行新堂啟用與獻堂感恩崇拜。</p>' }
  ];

  let historyController = null;

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

  function buildMilestoneDetailMarkup(item) {
    const detailClean = rich(item.detail_html || '');
    const photoUrl = resolveMediaUrl(item.photo_path);
    if (!photoUrl) return detailClean;
    const altText = esc(item.photo_alt || `${item.year_label} ${item.title}`);
    const safeUrl = esc(photoUrl);
    return `${detailClean}<figure class="history-detail-figure"><img src="${safeUrl}" alt="${altText}" loading="lazy"></figure>`;
  }

  function renderTimelineItems(records, fromSupabase = false) {
    const list = document.getElementById('historyTimeline');
    if (!list) return;
    list.replaceChildren();
    if (fromSupabase) list.setAttribute('data-source', 'supabase');
    records.forEach((item) => {
      const li = html('li', {
        class: 'about-timeline-item',
        'data-year': item.year_label,
        'data-sort-year': String(item.sort_year ?? '')
      });
      const detailMarkup = buildMilestoneDetailMarkup(item);
      const hasDetail = Boolean(detailMarkup && detailMarkup.replace(/<[^>]*>/g, '').trim().length > 0) || Boolean(item.photo_path);

      if (hasDetail) {
        const btn = html('button', {
          type: 'button',
          class: 'about-timeline-btn',
          'aria-expanded': 'false',
          'aria-controls': 'historyPopover'
        });
        btn.append(
          html('span', { class: 'about-timeline-year' }, item.year_label),
          html('span', { class: 'about-timeline-title' }, item.title),
          html('span', { class: 'about-timeline-caret', 'aria-hidden': 'true' }, '▾')
        );
        const tpl = document.createElement('template');
        tpl.className = 'about-timeline-detail';
        tpl.innerHTML = detailMarkup;
        li.append(btn, tpl);
      } else {
        const staticRow = html('div', { class: 'about-timeline-static' });
        staticRow.append(
          html('span', { class: 'about-timeline-year' }, item.year_label),
          html('span', { class: 'about-timeline-title' }, item.title)
        );
        li.append(staticRow);
      }
      list.append(li);
    });
  }

  function initHistoryTimelineInteractions() {
    const list = document.getElementById('historyTimeline');
    const popover = document.getElementById('historyPopover');
    const dialog = document.getElementById('historyDialog');
    if (!list || !popover || !dialog) return;

    const popYear = document.getElementById('historyPopoverYear');
    const popTitle = document.getElementById('historyPopoverTitle');
    const popBody = document.getElementById('historyPopoverBody');

    const dlgYear = document.getElementById('historyDialogYear');
    const dlgTitle = document.getElementById('historyDialogTitle');
    const dlgBody = document.getElementById('historyDialogBody');
    const dlgClose = document.getElementById('historyDialogClose');

    const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
    let openTimer = null;
    let closeTimer = null;
    let activePopoverBtn = null;
    let activeDialogBtn = null;

    function clearTimers() {
      if (openTimer) { clearTimeout(openTimer); openTimer = null; }
      if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    }

    function getItemPayload(btn) {
      const li = btn?.closest('.about-timeline-item');
      if (!li) return null;
      const year = li.querySelector('.about-timeline-year')?.textContent.trim() || '';
      const title = li.querySelector('.about-timeline-title')?.textContent.trim() || '';
      const tpl = li.querySelector('template.about-timeline-detail');
      const detailHtml = tpl ? rich(tpl.innerHTML) : '';
      if (!detailHtml) return null;
      return { year, title, detailHtml };
    }

    function syncExpandedStates() {
      list.querySelectorAll('.about-timeline-btn').forEach((btn) => {
        const isOpen = (btn === activePopoverBtn && !popover.hidden) || (btn === activeDialogBtn && dialog.open);
        btn.setAttribute('aria-expanded', String(Boolean(isOpen)));
        btn.setAttribute('aria-controls', dialog.open && btn === activeDialogBtn ? 'historyDialog' : 'historyPopover');
      });
    }

    function positionPopover(btn) {
      if (!btn || popover.hidden) return;
      const vw = document.documentElement.clientWidth || window.innerWidth;
      const vh = document.documentElement.clientHeight || window.innerHeight;
      const margin = 12;
      const gap = 8;
      const maxW = Math.min(400, vw - margin * 2);
      popover.style.width = `${maxW}px`;
      popover.style.maxWidth = `${vw - margin * 2}px`;

      const btnRect = btn.getBoundingClientRect();
      const popRect = popover.getBoundingClientRect();
      const spaceBelow = vh - btnRect.bottom - margin;
      const spaceAbove = btnRect.top - margin;

      let top;
      if (spaceBelow >= popRect.height + gap || spaceBelow >= spaceAbove) {
        top = btnRect.bottom + gap;
        popover.style.maxHeight = `${Math.max(120, vh - top - margin)}px`;
      } else {
        const availAbove = Math.max(120, btnRect.top - gap - margin);
        popover.style.maxHeight = `${availAbove}px`;
        const updatedHeight = Math.min(popRect.height, availAbove);
        top = Math.max(margin, btnRect.top - updatedHeight - gap);
      }

      const left = Math.min(Math.max(margin, btnRect.left), Math.max(margin, vw - popRect.width - margin));
      popover.style.top = `${Math.round(top)}px`;
      popover.style.left = `${Math.round(left)}px`;
    }

    function closePopover() {
      clearTimers();
      if (popover.hidden && !activePopoverBtn) return;
      popover.hidden = true;
      activePopoverBtn = null;
      syncExpandedStates();
    }

    function openPopover(btn) {
      if (!btn || dialog.open) return;
      const payload = getItemPayload(btn);
      if (!payload) return;
      clearTimers();
      activePopoverBtn = btn;
      if (popYear) popYear.textContent = payload.year;
      if (popTitle) popTitle.textContent = payload.title;
      if (popBody) popBody.innerHTML = payload.detailHtml;
      popover.hidden = false;
      syncExpandedStates();
      positionPopover(btn);
    }

    function scheduleOpenPopover(btn) {
      if (!finePointer.matches || dialog.open) return;
      clearTimers();
      if (activePopoverBtn === btn && !popover.hidden) return;
      openTimer = setTimeout(() => openPopover(btn), 120);
    }

    function scheduleClosePopover() {
      clearTimers();
      closeTimer = setTimeout(() => closePopover(), 150);
    }

    function closeDialog(restoreFocus = true) {
      const originBtn = activeDialogBtn;
      activeDialogBtn = null;
      if (dialog.open) dialog.close();
      document.body.classList.remove('history-modal-open');
      syncExpandedStates();
      if (restoreFocus && originBtn) originBtn.focus();
    }

    function openDialog(btn) {
      const payload = getItemPayload(btn);
      if (!payload) return;
      closePopover();
      activeDialogBtn = btn;
      if (dlgYear) dlgYear.textContent = payload.year;
      if (dlgTitle) dlgTitle.textContent = payload.title;
      if (dlgBody) dlgBody.innerHTML = payload.detailHtml;
      document.body.classList.add('history-modal-open');
      if (!dialog.open) {
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');
      }
      syncExpandedStates();
      dlgClose?.focus();
    }

    if (!historyController) {
      list.addEventListener('mouseover', (e) => {
        const btn = e.target.closest('.about-timeline-btn');
        if (btn) scheduleOpenPopover(btn);
      });
      list.addEventListener('mouseout', (e) => {
        const btn = e.target.closest('.about-timeline-btn');
        if (!btn) return;
        const related = e.relatedTarget;
        if (related && (btn.contains(related) || popover.contains(related))) return;
        scheduleClosePopover();
      });
      list.addEventListener('focusin', (e) => {
        const btn = e.target.closest('.about-timeline-btn');
        if (btn && finePointer.matches && !dialog.open) scheduleOpenPopover(btn);
      });
      list.addEventListener('focusout', (e) => {
        const btn = e.target.closest('.about-timeline-btn');
        if (!btn) return;
        const next = e.relatedTarget;
        if (next && (btn.contains(next) || popover.contains(next))) return;
        scheduleClosePopover();
      });
      list.addEventListener('click', (e) => {
        const btn = e.target.closest('.about-timeline-btn');
        if (!btn) return;
        e.preventDefault();
        openDialog(btn);
      });
      popover.addEventListener('mouseenter', () => clearTimers());
      popover.addEventListener('mouseleave', (e) => {
        const related = e.relatedTarget;
        if (related && activePopoverBtn && activePopoverBtn.contains(related)) return;
        scheduleClosePopover();
      });
      dlgClose?.addEventListener('click', () => closeDialog(true));
      dialog.addEventListener('cancel', (e) => {
        e.preventDefault();
        closeDialog(true);
      });
      dialog.addEventListener('click', (e) => {
        const card = dialog.querySelector('.history-dialog-card');
        if (card && !card.contains(e.target)) closeDialog(true);
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          if (dialog.open) {
            e.preventDefault();
            closeDialog(true);
          } else if (!popover.hidden) {
            const origin = activePopoverBtn;
            closePopover();
            origin?.focus();
          }
        }
      });
      window.addEventListener('scroll', () => {
        if (activePopoverBtn && !popover.hidden) positionPopover(activePopoverBtn);
      }, { passive: true });
      window.addEventListener('resize', () => {
        if (activePopoverBtn && !popover.hidden) positionPopover(activePopoverBtn);
      });
      historyController = { closePopover, closeDialog };
    }
  }

  async function renderHistoryMilestones() {
    const list = document.getElementById('historyTimeline');
    if (!list || !state.client) return;
    try {
      const { data, error } = await state.client
        .from('history_milestones')
        .select('*')
        .eq('is_published', true)
        .order('sort_year', { ascending: true })
        .order('sort_order', { ascending: true });

      if (error || !data?.length) return;
      historyController?.closePopover();
      renderTimelineItems(data, true);
    } catch (_err) {
      // 保留靜態預設內容
    }
  }

  /* ---------- 2. 頁面單一內容區塊套用 (public.page_content) ---------- */
  function registerEditableTargets() {
    const title = document.querySelector('.page-title');
    const description = document.querySelector('.page-description');
    if (title && !title.dataset.cmsKey) title.dataset.cmsKey = 'page_title';
    if (description && !description.dataset.cmsKey) description.dataset.cmsKey = 'page_description';

    if (page === 'index.html') {
      document.querySelector('.tb-hero-inner h1')?.setAttribute('data-cms-key', 'hero_headline');
      document.querySelector('.tb-hero-inner > p')?.setAttribute('data-cms-key', 'hero_lead');
      const visitSteps = document.querySelector('#first-visit ol, #first-visit ul, .visit-steps, .tb-split ol, .tb-split ul');
      if (visitSteps) visitSteps.setAttribute('data-cms-key', 'first_visit_steps');
      const cards = document.querySelectorAll('.tb-card-grid .tb-card .tb-card-body');
      if (cards[0]) cards[0].setAttribute('data-cms-key', 'card_worship');
      if (cards[1]) cards[1].setAttribute('data-cms-key', 'card_fellowship');
      if (cards[2]) cards[2].setAttribute('data-cms-key', 'card_prayer');
      const pl = document.querySelector('#promised-land [data-cms-key]');
      if (pl) pl.setAttribute('data-cms-key', 'promised_land_intro');
    }

    if (page === 'about.html') {
      document.querySelector('.about-intro .tb-lead, .page-description')?.setAttribute('data-cms-key', 'about_intro');
      const vmv = document.querySelectorAll('.about-vmv-grid article');
      if (vmv[0]) vmv[0].setAttribute('data-cms-key', 'vision');
      if (vmv[1]) vmv[1].setAttribute('data-cms-key', 'mission');
      if (vmv[2]) vmv[2].setAttribute('data-cms-key', 'values');
    }

    if (page === 'events.html') {
      document.querySelector('[data-pending="events-gathering-notice"]')?.setAttribute('data-cms-key', 'gathering_tips');
    }

    if (page === 'giving.html') {
      document.querySelector('.page-description')?.setAttribute('data-cms-key', 'giving_scripture');
      document.querySelector('.verified-steps')?.setAttribute('data-cms-key', 'giving_steps');
      document.querySelector('.official-notice')?.setAttribute('data-cms-key', 'cutoff_callout');
    }

    if (page === 'prayer.html') {
      document.querySelector('.page-description')?.setAttribute('data-cms-key', 'prayer_scripture');
      document.querySelector('#prayerFormStatus')?.setAttribute('data-cms-key', 'privacy_notice');
    }
  }

  function applyPageContent(rows) {
    if (!rows?.length) return;
    const byKey = new Map(rows.map((r) => [r.content_key, r.content_html]));

    document.querySelectorAll('[data-cms-key]').forEach((el) => {
      const key = el.getAttribute('data-cms-key');
      if (!byKey.has(key)) return;
      const val = String(byKey.get(key) ?? '').trim();
      if (key === 'gathering_tips' || key === 'events_gathering_notice') {
        if (!val) {
          el.hidden = true;
          el.style.display = 'none';
          return;
        }
        el.hidden = false;
        el.style.display = '';
      }
      if (!val) return;
      el.innerHTML = rich(val);
      el.setAttribute('data-source', 'supabase');
    });

    if (page === 'events.html' && byKey.has('gathering_location')) {
      const locText = String(byKey.get('gathering_location') ?? '').trim();
      if (locText) {
        const candidates = [...document.querySelectorAll('p, div, span')].filter((el) => el.children.length === 0 && el.textContent.includes('聚會地點：'));
        if (candidates[0]) {
          candidates[0].innerHTML = rich(locText);
          candidates[0].setAttribute('data-source', 'supabase');
        }
      }
    }

    if (page === 'giving.html') {
      const card = document.querySelector('.verified-steps')?.closest('.card');
      if (card) {
        const paragraphs = [...card.querySelectorAll(':scope > p')];
        if (paragraphs[0] && byKey.has('physical_envelope_note')) {
          const v = String(byKey.get('physical_envelope_note') ?? '').trim();
          if (v) { paragraphs[0].innerHTML = rich(v); paragraphs[0].setAttribute('data-source', 'supabase'); }
        }
        if (paragraphs[1] && byKey.has('tax_note')) {
          const v = String(byKey.get('tax_note') ?? '').trim();
          if (v) { paragraphs[1].innerHTML = rich(v); paragraphs[1].setAttribute('data-source', 'supabase'); }
        }
      }
    }

    if (page === 'contact.html') {
      const infoItems = document.querySelectorAll('.footer-info-item');
      if (infoItems[0] && (byKey.has('address_zh') || byKey.has('address_en'))) {
        const zh = rich(byKey.get('address_zh') || '香港九龍觀塘成業街 10 號電訊一代廣場 23 樓 A 室');
        const en = rich(byKey.get('address_en') || 'Flat A, 23/F, TG Place, 10 Shing Yip Street, Kwun Tong, Kowloon, Hong Kong');
        const box = infoItems[0].querySelector('div');
        if (box) {
          box.innerHTML = `<strong>新堂址：</strong><br>${zh}<br><span style="font-size: 0.9rem; color: var(--kf-text-muted);">${en}</span>`;
          box.setAttribute('data-source', 'supabase');
        }
      }
      if (infoItems[1] && byKey.has('mtr_note')) {
        const box = infoItems[1].querySelector('div');
        const val = rich(byKey.get('mtr_note'));
        if (box && val) {
          box.innerHTML = `<strong>港鐵交通：</strong><br>${val}`;
          box.setAttribute('data-source', 'supabase');
        }
      }
      if (infoItems[2] && byKey.has('email')) {
        const box = infoItems[2].querySelector('div');
        const rawEmail = String(byKey.get('email') || '').replace(/<[^>]*>/g, '').trim();
        if (box && rawEmail) {
          box.innerHTML = `<strong>堂會電郵：</strong><br><a href="mailto:${esc(rawEmail)}">${esc(rawEmail)}</a>`;
          box.setAttribute('data-source', 'supabase');
        }
      }
      if (infoItems[3] && byKey.has('phone')) {
        const box = infoItems[3].querySelector('div');
        const val = rich(byKey.get('phone'));
        if (box && val) {
          box.innerHTML = `<strong>堂會聯絡電話：</strong><br>${val}`;
          box.setAttribute('data-source', 'supabase');
        }
      }
      if (byKey.has('map_url')) {
        const rawUrl = String(byKey.get('map_url') || '').replace(/<[^>]*>/g, '').trim();
        const iframe = document.querySelector('iframe[title*="地圖"]');
        if (iframe && /^https:\/\/maps\.google\.com\//i.test(rawUrl)) {
          iframe.src = rawUrl;
          iframe.setAttribute('data-source', 'supabase');
        }
      }
      if (byKey.has('form_url')) {
        const rawFormUrl = String(byKey.get('form_url') || '').replace(/<[^>]*>/g, '').trim();
        const btn = document.querySelector('#contactForm a.btn-primary');
        if (btn && /^https?:\/\//i.test(rawFormUrl)) {
          btn.href = rawFormUrl;
          btn.setAttribute('data-source', 'supabase');
        }
      }
    }
  }

  /* ---------- 3. 結構化資料表公開載入 (Replace, never append) ---------- */

  async function renderMinistryUnits() {
    if (!state.client) return;
    const container = document.querySelector('.about-care-list');
    if (!container) return;

    const { data, error } = await state.client
      .from('ministry_units')
      .select('*')
      .eq('is_published', true)
      .order('sort_order', { ascending: true });

    if (error || !data?.length) return;

    container.replaceChildren();
    container.setAttribute('data-source', 'supabase');

    data.forEach((unit, idx) => {
      const row = html('article', { class: 'about-care-row' });
      const ageCol = html('div', { class: 'about-age' });
      ageCol.append(
        html('span', {}, String(idx + 1).padStart(2, '0')),
        html('h3', {}, unit.audience_label || ''),
        html('p', {}, unit.tagline || '')
      );

      const detailCol = html('div');
      detailCol.append(html('h4', {}, unit.name));

      const subs = Array.isArray(unit.sub_units) ? unit.sub_units : [];
      if (subs.length) {
        const hasLabels = subs.some((s) => s && s.label);
        if (hasLabels) {
          const ul = html('ul', { class: 'about-subunits', 'aria-label': `${unit.name}屬下團契` });
          subs.forEach((s) => {
            const text = s.label ? `${s.name}（${s.label}）` : s.name;
            ul.append(html('li', {}, text));
          });
          detailCol.append(ul);
        } else {
          const suffix = unit.name === '安得烈團' ? '小組' : '';
          detailCol.append(html('p', {}, `${subs.map((s) => s.name).join('、')}${suffix}`));
        }
      }

      if (unit.description_html) {
        const desc = html('div', { class: 'cms-rich-content' });
        desc.innerHTML = rich(unit.description_html);
        detailCol.append(desc);
      }

      row.append(ageCol, detailCol);
      container.append(row);
    });
  }

  async function renderStaffMembers() {
    if (!state.client) return;
    const container = document.querySelector('.about-team-grid');
    if (!container) return;

    const { data, error } = await state.client
      .from('staff_members')
      .select('*')
      .eq('is_published', true)
      .order('sort_order', { ascending: true });

    if (error || !data?.length) return;

    container.replaceChildren();
    container.setAttribute('data-source', 'supabase');

    data.forEach((member) => {
      const card = html('article', { class: 'about-person' });
      const portrait = html('div', { class: 'about-portrait' });
      const imgSrc = resolveMediaUrl(member.photo_path) || `images/team/${member.name}.webp`;
      const img = html('img', {
        src: imgSrc,
        alt: member.photo_alt || `${member.name}${member.title || ''}人物插畫`,
        width: '640',
        height: '530',
        loading: 'lazy'
      });
      portrait.append(img);

      const bioDiv = html('div', { class: 'about-bio cms-rich-content' });
      const bioContent = String(member.bio_html || '').trim();
      bioDiv.innerHTML = bioContent ? rich(bioContent) : '<p class="about-muted">自我介紹內容待補充。</p>';

      card.append(
        portrait,
        html('h3', {}, member.name),
        html('p', { class: 'about-role' }, member.title),
        bioDiv
      );
      container.append(card);
    });
  }

  async function renderQaItems() {
    const container = document.querySelector('.about-faq-list');
    if (!container || !state.client) return;

    const { data, error } = await state.client
      .from('qa_items')
      .select('*')
      .eq('is_published', true)
      .order('sort_order', { ascending: true });

    if (error || !data?.length) return;

    container.replaceChildren();
    container.setAttribute('data-source', 'supabase');

    data.forEach((item, idx) => {
      const details = html('details', { class: 'about-faq-item', open: '' });
      const summary = html('summary');
      summary.append(html('span', {}, String(idx + 1).padStart(2, '0')), document.createTextNode(item.question));

      const body = html('div', { class: 'cms-rich-content' });
      const ans = String(item.answer_html || '').trim();
      body.innerHTML = ans ? rich(ans) : '<p class="about-muted">（內容待補）</p>';

      details.append(summary, body);
      container.append(details);
    });
  }

  async function renderWorshipServices() {
    if (!state.client) return;
    const { data, error } = await state.client
      .from('worship_services')
      .select('*')
      .eq('is_published', true)
      .order('sort_order', { ascending: true });

    if (error || !data?.length) return;

    if (page === 'contact.html') {
      const heading = [...document.querySelectorAll('.card h4')].find((h) => h.textContent.trim() === '聚會時間');
      const card = heading?.closest('.card');
      const p = card?.querySelector('p');
      if (p) {
        const primary = data.filter((s) => !s.is_concurrent);
        const sunday = primary.filter((s) => s.day_label === '週日');
        const others = primary.filter((s) => s.day_label !== '週日');
        const lines = [];
        if (sunday.length) {
          lines.push(`<strong>週日崇拜</strong>：${sunday.map((s) => `${esc(s.name.replace('崇拜', ''))}${esc(s.start_time)}`).join('／')}`);
        }
        others.forEach((s) => {
          const timeRange = s.end_time ? `${s.start_time}–${s.end_time}` : s.start_time;
          lines.push(`<strong>${esc(s.day_label)}${esc(s.name)}</strong>：${esc(timeRange)}`);
        });
        p.innerHTML = lines.join('<br>');
        p.setAttribute('data-source', 'supabase');
      }
    }

    if (page === 'events.html') {
      const tbody = document.querySelector('#services table tbody, .services-table tbody');
      if (tbody) {
        tbody.replaceChildren();
        tbody.setAttribute('data-source', 'supabase');
        data.filter((s) => !s.is_concurrent).forEach((s) => {
          const tr = html('tr');
          const timeText = s.end_time ? `${s.day_label} ${s.start_time}–${s.end_time}` : `${s.day_label} ${s.start_time}`;
          const aud = html('td', { class: 'cms-rich-content' });
          aud.innerHTML = rich(s.audience_html || '');
          tr.append(html('td', {}, s.name), html('td', {}, timeText), aud);
          tbody.append(tr);
        });
      }
      const childEl = document.querySelector('[data-pending="children-worship-details"]');
      const childRow = data.find((s) => s.is_concurrent);
      if (childEl && childRow) {
        childEl.innerHTML = rich(childRow.audience_html || '');
        childEl.setAttribute('data-source', 'supabase');
      }
    }
  }

  async function renderEventsCalendar() {
    if (page !== 'events.html' || !state.client) return;
    const container = document.querySelector('#calendar-2026 tbody, .calendar-2026-list, table tbody');
    if (!container) return;

    const { data, error } = await state.client
      .from('events')
      .select('*')
      .eq('is_public', true)
      .eq('is_published', true)
      .order('sort_order', { ascending: true })
      .order('starts_at', { ascending: true });

    if (error || !data?.length) return;

    container.replaceChildren();
    container.setAttribute('data-source', 'supabase');

    const isTable = container.tagName === 'TBODY';
    data.forEach((ev) => {
      const label = ev.date_label || fmt(ev.starts_at);
      if (isTable) {
        const tr = html('tr');
        tr.append(html('td', {}, label), html('td', {}, ev.title));
        container.append(tr);
      } else {
        const item = html('div', { class: 'calendar-item' });
        item.append(html('span', { class: 'calendar-date' }, label), html('span', { class: 'calendar-title' }, ev.title));
        container.append(item);
      }
    });
  }

  function makeNotice(item) {
    const article = html('article', { class: 'cms-item' });
    const meta = html('div', { class: 'cms-item-meta' }, `${esc(item.category || '大堂報告')} · ${fmt(item.published_at)}`);
    const title = html('h3', {}, item.title);
    const body = makeRichNode(item.content_html, item.body || item.content);
    article.append(meta, title, body);
    if (item.attachment_path && state.user) {
      const link = html('button', { class: 'cms-download', type: 'button' }, '下載附件 ↗');
      link.addEventListener('click', async () => {
        const { data, error } = await state.client.storage.from('member-documents').createSignedUrl(item.attachment_path, 60);
        if (!error && data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
      });
      article.append(link);
    }
    return article;
  }

  async function renderNotices(target, member = false) {
    if (!state.client) return;

    if (page === 'index.html' && target) {
      const { data, error } = await state.client
        .from('notices')
        .select('*')
        .eq('is_published', true)
        .order('is_pinned', { ascending: false })
        .order('published_at', { ascending: false })
        .limit(2);

      if (error || !data?.length) return;
      target.replaceChildren();
      target.setAttribute('data-source', 'supabase');
      data.forEach((item) => {
        const card = html('article', { class: 'cms-item' });
        const bodyText = String(item.body || item.content || '').replace(/<[^>]*>/g, '').trim();
        card.append(
          html('h3', {}, item.title),
          html('p', {}, bodyText),
          html('a', { href: 'news.html' }, '查看消息 →')
        );
        target.append(card);
      });
      return;
    }

    if (page === 'news.html') {
      const groupContainer = document.getElementById('reportDateGroups');
      const { data, error } = await state.client
        .from('notices')
        .select('*')
        .eq('is_published', true)
        .order('published_at', { ascending: false })
        .order('sort_order', { ascending: true });

      if (error || !data?.length) return;

      if (groupContainer) {
        const groupsMap = new Map();
        data.forEach((item) => {
          const d = item.published_at ? new Date(item.published_at) : new Date();
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          const dateKey = `${yyyy}-${mm}-${dd}`;
          const dateTitle = `${yyyy}年${d.getMonth() + 1}月${d.getDate()}日`;
          if (!groupsMap.has(dateKey)) groupsMap.set(dateKey, { dateTitle, items: [] });
          groupsMap.get(dateKey).items.push(item);
        });

        const activeBtn = document.querySelector('.news-filter-btn[aria-pressed="true"]');
        const dir = activeBtn?.getAttribute('data-news-sort') || 'desc';
        const factor = dir === 'asc' ? 1 : -1;
        const sortedKeys = [...groupsMap.keys()].sort((a, b) => a.localeCompare(b) * factor);

        groupContainer.replaceChildren();
        groupContainer.setAttribute('data-source', 'supabase');

        sortedKeys.forEach((dateKey) => {
          const grp = groupsMap.get(dateKey);
          const groupDiv = html('div', { class: 'news-date-group', 'data-group-date': dateKey });
          const heading = html('h3', { style: 'font-size: 1.05rem; color: var(--kf-secondary); margin-bottom: 0.85rem; letter-spacing: 0.04em;' }, grp.dateTitle);
          const itemsGrid = html('div', { class: 'grid-2 news-group-items' });

          grp.items.sort((a, b) => String(a.published_at || '').localeCompare(String(b.published_at || '')) * factor);
          grp.items.forEach((item) => {
            const card = html('article', { class: 'card', 'data-item-date': item.published_at || dateKey });
            const titleEl = html('h3', { class: 'card-title' }, item.title);
            const bodyEl = html('div', { class: 'card-text cms-rich-content' });
            bodyEl.innerHTML = rich(item.content_html || `<p>${esc(item.body || item.content || '')}</p>`);
            card.append(titleEl, bodyEl);
            itemsGrid.append(card);
          });

          groupDiv.append(heading, itemsGrid);
          groupContainer.append(groupDiv);
        });
        if (target) target.replaceChildren();
        return;
      }
    }

    if (!target) return;
    const { data, error } = await state.client
      .from('notices')
      .select('*')
      .eq('is_published', true)
      .order('published_at', { ascending: false });
    if (error || !data?.length) return;
    target.replaceChildren();
    target.setAttribute('data-source', 'supabase');
    target.closest('section')?.classList.remove('is-hidden');
    data.forEach((item) => target.append(makeNotice(item)));
  }

  async function renderPrayers(target) {
    if (page !== 'prayer.html' || !state.client) return;
    const { data, error } = await state.client
      .from('prayer_requests')
      .select('*')
      .eq('is_public', true)
      .eq('is_published', true)
      .order('sort_order', { ascending: true });

    if (error || !data?.length) return;

    const generalItems = data.filter((item) => item.category !== '禱告邀約');
    const inviteItems = data.filter((item) => item.category === '禱告邀約');

    const staticGrid = target?.nextElementSibling;
    if (generalItems.length && staticGrid) {
      staticGrid.replaceChildren();
      staticGrid.setAttribute('data-source', 'supabase');
      generalItems.forEach((item) => {
        const card = html('article', { class: 'card' });
        const body = html('div', { class: 'card-text cms-rich-content' });
        body.innerHTML = rich(item.content_html || `<p>${esc(item.content || '')}</p>`);
        card.append(html('h3', { class: 'card-title' }, item.title), body);
        staticGrid.append(card);
      });
      if (target) target.replaceChildren();
    }

    const inviteTarget = document.getElementById('dynamicPrayerInvitations');
    if (inviteTarget && inviteItems.length) {
      inviteTarget.replaceChildren();
      inviteTarget.setAttribute('data-source', 'supabase');
      inviteItems.forEach((item) => {
        const card = html('article', { class: 'card' });
        const body = html('div', { class: 'card-text cms-rich-content' });
        body.innerHTML = rich(item.content_html || `<p>${esc(item.content || '')}</p>`);
        card.append(html('h3', { class: 'card-title' }, item.title), body);
        inviteTarget.append(card);
      });
    }
  }

  async function renderGivingMethods() {
    if (page !== 'giving.html' || !state.client) return;
    const container = document.querySelector('.card-grid');
    if (!container) return;

    const { data, error } = await state.client
      .from('giving_methods')
      .select('*')
      .eq('is_published', true)
      .order('sort_order', { ascending: true });

    if (error || !data?.length) return;

    container.replaceChildren();
    container.setAttribute('data-source', 'supabase');

    data.forEach((m) => {
      const card = html('div', { class: 'card', style: 'display: flex; flex-direction: column;' });
      card.append(html('h3', { style: 'margin-bottom: 1rem; color: var(--kf-primary);' }, m.name));

      const intro = html('div', { style: 'color: var(--kf-text-secondary); margin-bottom: 1.5rem;', class: 'cms-rich-content' });
      const box = html('div', { style: 'background: var(--kf-bg-alt); padding: 1.2rem; border-radius: var(--kf-radius); margin-bottom: 1.5rem; flex: 1;' });

      if (m.method_type === 'cheque') {
        const firstP = m.instructions_html ? String(m.instructions_html).match(/<p>.*?<\/p>/i)?.[0] || '' : '';
        const restHtml = m.instructions_html ? String(m.instructions_html).replace(firstP, '') : '';
        intro.innerHTML = rich(firstP || `<p>可使用東亞銀行入票機存入支票（${esc(m.identifier)}）。</p>`);
        box.innerHTML = `<div style="font-size: 0.9rem; color: var(--kf-text-secondary); line-height: 1.8;">${rich(restHtml)}</div>`;
      } else {
        intro.innerHTML = rich(m.instructions_html || '');
        const idStyle = m.method_type === 'fps'
          ? 'font-size: 1.4rem; font-family: var(--kf-font-serif); font-weight: bold; color: var(--kf-secondary); margin: 0.3rem 0;'
          : 'font-size: 1.1rem; font-weight: 600; color: var(--kf-primary); margin: 0.3rem 0;';
        box.innerHTML = `
          <div style="font-size: 0.85rem; color: var(--kf-text-muted);">${esc(m.bank_name)}</div>
          <div style="${idStyle}">${esc(m.identifier)}</div>
          <div style="font-size: 0.85rem; color: var(--kf-text-secondary); margin-top: 0.4rem;">戶名：${esc(m.account_name)}</div>
        `;
      }

      const btnWrap = html('div');
      const formUrl = m.form_url || 'https://forms.gle/mBxv2DxSDLAq9bS88';
      btnWrap.append(html('a', {
        class: 'btn btn-walnut',
        href: formUrl,
        target: '_blank',
        rel: 'noopener noreferrer'
      }, '填寫奉獻登記表 ↗'));

      card.append(intro, box, btnWrap);
      container.append(card);
    });
  }

  /* ---------- 4. 導覽列、權限與會友專區 ---------- */
  function fallback(message) {
    document.querySelectorAll('[data-cms-status]').forEach((el) => setStatus(el, message, 'muted'));
  }

  async function syncUser(user) {
    state.user = user;
    state.role = 'guest';
    if (!user || !state.client) return;
    const { data } = await state.client.from('profiles').select('role,full_name').eq('id', user.id).maybeSingle();
    state.role = data?.role || 'member';
    state.displayName = data?.full_name || user.email || '';
  }

  function injectNav() {
    const nav = document.querySelector('#navMenu');
    if (!nav) return;
    const members = [...nav.querySelectorAll('a[href="members.html"]')];
    let member = members.shift();
    members.forEach((link) => link.closest('li')?.remove());
    if (!member) {
      const li = html('li', { class: 'nav-item', 'data-auth-link': 'true' });
      member = html('a', { class: 'nav-link', href: 'members.html' });
      li.append(member);
      nav.append(li);
    }
    member.textContent = state.user ? '會友專區' : '會友登入';
    member.classList.toggle('active', page === 'members.html');
    if (page === 'members.html') member.setAttribute('aria-current', 'page');
    else member.removeAttribute('aria-current');

    let admin = nav.querySelector('[data-admin-link]');
    if (['admin', 'editor', 'staff'].includes(state.role)) {
      if (!admin) {
        admin = html('li', { class: 'nav-item', 'data-admin-link': 'true' });
        admin.append(html('a', { class: 'nav-link', href: 'admin.html' }, '管理後台'));
        nav.append(admin);
      }
      const link = admin.querySelector('a');
      link.classList.toggle('active', page === 'admin.html');
      if (page === 'admin.html') link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    } else if (page !== 'admin.html') {
      admin?.remove();
    }
  }

  async function initMembers() {
    const login = document.querySelector('#memberLogin');
    const panel = document.querySelector('#memberPanel');
    const status = document.querySelector('[data-member-status]');
    const list = document.querySelector('#memberNotices');
    const refresh = async () => {
      if (state.user) {
        login?.classList.add('is-hidden');
        panel?.classList.remove('is-hidden');
        setStatus(status, `已登入：${state.user.email}（${state.role === 'admin' ? '管理員' : state.role === 'staff' ? '同工' : '會友'}）`, 'success');
        await renderNotices(list, true);
      } else {
        login?.classList.remove('is-hidden');
        panel?.classList.add('is-hidden');
        setStatus(status, '請使用教會發出的會友或同工電郵登入。', 'muted');
      }
    };
    await refresh();
    document.querySelector('#memberLoginForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const { data, error } = await state.client.auth.signInWithPassword({
        email: String(form.get('email')).trim(),
        password: String(form.get('password'))
      });
      if (error) return setStatus(status, '登入失敗，請檢查電郵及密碼。', 'error');
      await syncUser(data.user);
      injectNav();
      await refresh();
    });
    document.querySelector('#memberLogout')?.addEventListener('click', async () => {
      await state.client.auth.signOut();
      state.user = null;
      state.role = 'guest';
      injectNav();
      refresh();
    });
  }

  /* ---------- 5. 啟動流程 ---------- */
  async function boot() {
    if (page === 'admin.html' && window.KF_ADMIN_DASHBOARD) return;
    injectNav();
    if (page === 'about.html') {
      if (!document.querySelector('#historyTimeline .about-timeline-item')) {
        renderTimelineItems(SEED_HISTORY_MILESTONES, false);
      }
      initHistoryTimelineInteractions();
    }
    registerEditableTargets();

    if (!config?.url || !config?.anonKey) {
      return fallback('未設定內容服務連線，保留原有內容。');
    }

    try {
      if (!window.supabase) await addScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
      if (!window.DOMPurify) await addScript('https://cdn.jsdelivr.net/npm/dompurify@3.1.7/dist/purify.min.js');

      state.client = window.supabase.createClient(config.url, config.anonKey);
      const { data } = await state.client.auth.getSession();
      await syncUser(data.session?.user || null);
      state.client.auth.onAuthStateChange((_event, session) => syncUser(session?.user || null));
      injectNav();

      const pageSlug = page.replace(/\.html$/i, '') || 'index';
      const { data: pageRows, error: pageErr } = await state.client
        .from('page_content')
        .select('content_key,content_html')
        .eq('is_published', true)
        .in('page', [pageSlug, page, 'shared']);

      if (!pageErr && pageRows?.length) applyPageContent(pageRows);

      if (page === 'index.html') {
        await renderNotices(document.getElementById('dynamicHomeNotices'));
      }
      if (page === 'about.html') {
        await Promise.allSettled([
          renderMinistryUnits(),
          renderStaffMembers(),
          renderHistoryMilestones(),
          renderQaItems()
        ]);
      }
      if (page === 'events.html') {
        await Promise.allSettled([
          renderWorshipServices(),
          renderEventsCalendar(),
          renderQaItems()
        ]);
      }
      if (page === 'news.html') {
        await renderNotices(document.getElementById('dynamicNotices'));
      }
      if (page === 'prayer.html') {
        await renderPrayers(document.getElementById('dynamicPrayers'));
      }
      if (page === 'giving.html') {
        await renderGivingMethods();
      }
      if (page === 'contact.html') {
        await renderWorshipServices();
      }
      if (page === 'members.html') {
        await initMembers();
      }
    } catch (error) {
      console.warn('[KF CMS]', error);
      fallback('目前暫時無法連線，仍可瀏覽頁面上的固定內容。');
    }
  }

  boot();
})();
