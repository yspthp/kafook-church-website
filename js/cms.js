/* Ka Fook dynamic content, auth, member area and staff CMS (Warm Timber + DOMPurify XSS protection). */
(function () {
  'use strict';
  const config = window.KF_SUPABASE_CONFIG;
  const page = location.pathname.split('/').pop() || 'index.html';
  const state = { client: null, user: null, role: 'guest' };
  const esc = (value) => String(value ?? '');
  const fmt = (value) => value ? new Intl.DateTimeFormat('zh-HK', { dateStyle: 'medium' }).format(new Date(value)) : '';

  const SHARED_FAQ_ITEMS = [
    {
      num: '01',
      q: '崇拜會做什麼？',
      a: '我們會一同唱詩歌敬拜、同心禱告，並聆聽牧者按聖經分享信息；透過詩歌與真道親近神，彼此祝福。不用擔心不熟悉流程，現場均有投影及同工協助。'
    },
    {
      num: '02',
      q: '崇拜時間有多長？',
      a: '約1小時30分鐘，包括詩歌敬拜和講道。'
    },
    {
      num: '03',
      q: '崇拜有服飾要求嗎？',
      a: '沒有特別要求，穿您覺得舒適的衣服就好。請避免衣著暴露，也不適宜穿著拖鞋。'
    },
    {
      num: '04',
      q: '我可以帶同孩子參與嗎？',
      a: '歡迎！週日午堂崇拜（11:15）同時設有兒童崇拜，讓小朋友在適合他們的群體中敬拜和學習聖經；禮堂亦設有直播間，方便家長攜同幼兒參與崇拜。若您的孩子已踏入青少年階段，我們也設有青少年崇拜（週六 17:30–18:30，主要對象為中學及大專學生）。'
    },
    {
      num: '05',
      q: '兒童崇拜適合甚麼年齡的小朋友參加？',
      a: '兒童崇拜由幼稚園 K1 開始，適合幼稚園及小學階段的小朋友參與（於週日 11:15 與午堂崇拜同時舉行）。'
    },
    {
      num: '06',
      q: '奉獻是崇拜過程必須的嗎？',
      a: '不需要。奉獻是在明白奉獻意義的情況下自願的回應，並非必須。'
    }
  ];

  const SEED_HISTORY_MILESTONES = [
    {
      year_label: '1968',
      sort_year: 1968,
      sort_order: 10,
      title: '慈雲山開基',
      detail_html: '<p>1966年借用慈雲山一間醫務所作聚會地點，1968年正式成立「五旬節聖潔會慈雲山堂」，初期聚會人數只有十多人。</p>'
    },
    {
      year_label: '1969',
      sort_year: 1969,
      sort_order: 20,
      title: '永光小學時期',
      detail_html: '<p>遷入五旬節聖潔會第二永光學校，以學校作為福音工作的重要平台。七十至八十年代以小學生佈道為主要發展方向；至八十年代末，聚會人數增長至接近二百人，教會經濟亦漸趨穩定。</p>'
    },
    {
      year_label: '1995–1996',
      sort_year: 1995,
      sort_order: 30,
      title: '首次置業・更名迦福堂',
      detail_html: '<p>因應慈雲山區重建，教會成立「建堂委員會」，由等待政府安置轉向自行置業。1995年購入九龍城嘉福閣閣樓單位；1996年正式進駐九龍城，並因地域遷移改名為「五旬節聖潔會迦福堂」。</p>'
    },
    {
      year_label: '1999',
      sort_year: 1999,
      sort_order: 40,
      title: '青年架構重組',
      detail_html: '<p>原有高中團契彼得團及初中團契約翰團，重組為大專團契「彼得之家」，以及少年團「Teen家」及「豐盛之家」，確立以學生工作作為福音發展主幹。</p>'
    },
    {
      year_label: '2002',
      sort_year: 2002,
      sort_order: 50,
      title: '落戶觀塘',
      detail_html: '<p>因聚會空間不敷應用，遷往觀塘道410號觀點中心12樓，展開觀塘區的長遠服侍。</p>'
    },
    {
      year_label: '2006',
      sort_year: 2006,
      sort_order: 60,
      title: '分家與小組牧養',
      detail_html: '<p>成立雅比斯之家並推行小組牧養；拓展大專團契安得烈團，由彼得之家分為雲彩之家、懷道之家、恩火之家及傳光之家；少年團分為錫安之家、甘霖之家、曙光之家、薪火之家及基石之家。</p>'
    },
    {
      year_label: '2007–2008',
      sort_year: 2007,
      sort_order: 70,
      title: '入校工作與首支隊工',
      detail_html: '<p>2007年與東華三院呂潤財紀念中學合辦香港基督少年軍，開展將軍澳入校工作。2008年成立本堂第一支隊工「恩冕籃球隊」。</p>'
    },
    {
      year_label: '2011',
      sort_year: 2011,
      sort_order: 80,
      title: '棋匯坊成立',
      detail_html: '<p>成立隊工「棋匯坊」，以板棋作為傳福音媒介，藉活動與新朋友建立關係。</p>'
    },
    {
      year_label: '2012',
      sort_year: 2012,
      sort_order: 90,
      title: '諾知原開辦',
      detail_html: '<p>於將軍澳慧安商場開辦「諾知原教育中心」（Promised Land），以補習班及興趣班接觸區內學生。同年於迦密主恩中學開展學生信仰小組，並首次舉辦柬埔寨短宣團。</p>'
    },
    {
      year_label: '2013–2016',
      sort_year: 2013,
      sort_order: 100,
      title: '傳恩之家與入校資助',
      detail_html: '<p>2013年成立傳恩之家，作為中學文憑試考生及大專生的牧養群體；同年獲教育局區本計劃資助，與高雷中學合作舉辦課程。至2016年已與觀塘及將軍澳區五所中學建立合作，包括高雷中學、新生命教育協會呂郭碧鳳中學、聖安當女書院、東華三院呂潤財紀念中學及迦密主恩中學，透過學術課程、功課輔導及義工訓練等接觸逾百名中學生。</p>'
    },
    {
      year_label: '2016',
      sort_year: 2016,
      sort_order: 110,
      title: '提摩太團成立',
      detail_html: '<p>成立活泉之家，與傳恩之家合組成「提摩太團」，聚焦大專生活中的信仰挑戰與大專校園福音工作。</p>'
    },
    {
      year_label: '2017',
      sort_year: 2017,
      sort_order: 120,
      title: '小組化牧養與建堂起步',
      detail_html: '<p>安得烈團重組為六個小組：申命、因愛、葡萄園、傳愛、恩悅、承命，其中申命及因愛為夫婦小組，其餘為職青小組；少年團重組為揚光之家及使命之家。同年11月購入觀塘成業街10號電訊一代廣場23樓C2室，並啟動「天國小錢」建堂捐獻計劃。</p>'
    },
    {
      year_label: '2018',
      sort_year: 2018,
      sort_order: 130,
      title: '五十週年堂慶',
      detail_html: '<p>推動「全堂合一佈道運動」及相關堂慶活動，總結多年來的組織發展與福音外展。</p>'
    },
    {
      year_label: '2024–2026',
      sort_year: 2024,
      sort_order: 140,
      title: '新堂啟用',
      detail_html: '<p>2024年啟動「天國小錢2025」建堂捐獻計劃；2025年購置新堂物業；2026年1月25日舉行新堂啟用與獻堂感恩崇拜。</p>'
    }
  ];

  const rich = (value) => {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    if (window.DOMPurify) {
      return window.DOMPurify.sanitize(raw, {
        USE_PROFILES: { html: true },
        ADD_ATTR: ['target', 'rel', 'loading', 'open']
      });
    }
    const fallback = document.createElement('div');
    fallback.textContent = raw;
    return fallback.innerHTML;
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
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    if (text) el.textContent = text;
    return el;
  };
  const setStatus = (el, text, kind = '') => {
    if (!el) return;
    el.textContent = text;
    el.className = `cms-status ${kind}`.trim();
  };
  function renderSharedFaq() {
    const faqList = document.querySelector('#faq .about-faq-list');
    if (!faqList) return;
    faqList.dataset.cmsKey = 'shared_faq_list';
    faqList.replaceChildren();
    SHARED_FAQ_ITEMS.forEach((item) => {
      const details = html('details', { class: 'about-faq-item', open: '' });
      const summary = html('summary');
      summary.append(html('span', {}, item.num), document.createTextNode(item.q));
      details.append(summary, html('p', {}, item.a));
      faqList.append(details);
    });
  }

  /* ---------- Rule 3: Progressive Disclosure for 堂會歷史 ---------- */
  let historyController = null;

  function resolveMilestonePhotoUrl(photoPath) {
    if (!photoPath) return '';
    const trimmed = String(photoPath).trim();
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('images/')) return trimmed;
    if (state.client) {
      const { data } = state.client.storage.from('cms-media').getPublicUrl(trimmed);
      return data?.publicUrl || '';
    }
    return '';
  }

  function buildMilestoneDetailMarkup(item) {
    const detailClean = rich(item.detail_html || '');
    const photoUrl = resolveMilestonePhotoUrl(item.photo_path);
    if (!photoUrl) return detailClean;
    const altText = esc(item.photo_alt || `${item.year_label} ${item.title}`);
    const safeUrl = esc(photoUrl);
    return `${detailClean}<figure class="history-detail-figure"><img src="${safeUrl}" alt="${altText}" loading="lazy"></figure>`;
  }

  function renderTimelineItems(records) {
    const list = document.getElementById('historyTimeline');
    if (!list) return;
    list.replaceChildren();
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

      const left = Math.min(
        Math.max(margin, btnRect.left),
        Math.max(margin, vw - popRect.width - margin)
      );

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
        if (!btn) return;
        scheduleOpenPopover(btn);
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
        if (!btn) return;
        if (finePointer.matches && !dialog.open) {
          scheduleOpenPopover(btn);
        }
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
        if (card && !card.contains(e.target)) {
          closeDialog(true);
        }
      });

      dialog.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
          const focusables = [...dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
            .filter((el) => !el.disabled && !el.hidden);
          if (!focusables.length) return;
          const first = focusables[0];
          const last = focusables[focusables.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
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
      renderTimelineItems(data);
    } catch (_err) {
      // Graceful fallback: keep embedded 14 static rows
    }
  }

  function registerEditableTargets() {
    const title = document.querySelector('.page-title');
    const description = document.querySelector('.page-description');
    if (title) title.dataset.cmsKey = 'page_title';
    if (description) description.dataset.cmsKey = 'page_description';
    if (page === 'index.html' || page === '') {
      document.querySelector('.tb-hero-inner > p')?.setAttribute('data-cms-key', 'home_hero_description');
      document.querySelector('[data-cms-key="home_promised_land"]')?.setAttribute('data-cms-key', 'home_promised_land');
    }
    if (page === 'events.html') {
      document.querySelector('[data-pending="events-gathering-notice"]')?.setAttribute('data-cms-key', 'events_gathering_notice');
      document.querySelector('[data-pending="children-worship-details"]')?.setAttribute('data-cms-key', 'events_children_worship');
    }
    if (page === 'about.html') {
      document.querySelector('[data-pending="staff-bio-lam-suk-ying"]')?.setAttribute('data-cms-key', 'staff_bio_1');
      document.querySelector('[data-pending="staff-bio-lam-shiu-fung"]')?.setAttribute('data-cms-key', 'staff_bio_2');
      document.querySelector('[data-pending="staff-bio-mung-kit-man"]')?.setAttribute('data-cms-key', 'staff_bio_3');
      document.querySelector('[data-pending="staff-bio-wong-tsz-kwan"]')?.setAttribute('data-cms-key', 'staff_bio_4');
      document.querySelector('[data-pending="staff-bio-ng-tin-yan"]')?.setAttribute('data-cms-key', 'staff_bio_5');
    }
  }
  function applyPageContent(rows) {
    rows?.forEach((row) => {
      const target = document.querySelector(`[data-cms-key="${CSS.escape(row.content_key)}"]`);
      if (target) target.innerHTML = rich(row.content_html);
    });
  }
  const addScript = (src) => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src; script.onload = resolve; script.onerror = reject;
    document.head.append(script);
  });
  async function boot() {
    if (page === 'admin.html' && window.KF_ADMIN_DASHBOARD) return;
    injectNav();
    renderSharedFaq();
    if (page === 'about.html') {
      if (!document.querySelector('#historyTimeline .about-timeline-item')) {
        renderTimelineItems(SEED_HISTORY_MILESTONES);
      }
      initHistoryTimelineInteractions();
    }
    registerEditableTargets();
    if (!config?.url || !config?.anonKey) return fallback('未設定內容服務連線，保留原有內容。');
    try {
      if (!window.supabase) await addScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
      if (!window.DOMPurify) await addScript('https://cdn.jsdelivr.net/npm/dompurify@3.1.7/dist/purify.min.js');
      state.client = window.supabase.createClient(config.url, config.anonKey);
      const { data } = await state.client.auth.getSession();
      await syncUser(data.session?.user || null);
      state.client.auth.onAuthStateChange((_event, session) => syncUser(session?.user || null));
      injectNav();
      const pageContent = await state.client.from('page_content').select('content_key,content_html').in('page', [page || 'index.html', 'shared']).eq('visibility', 'public');
      if (!pageContent.error) applyPageContent(pageContent.data);
      if (page === 'index.html' || page === '') await renderHome();
      if (page === 'about.html') await renderHistoryMilestones();
      if (page === 'news.html') await renderNotices(ensureTarget('dynamicNotices', '最新動態通告'));
      if (page === 'prayer.html') await renderPrayers(ensureTarget('dynamicPrayers', '大堂代禱事項'));
      if (page === 'members.html') await initMembers();
      if (page === 'admin.html' && !window.KF_ADMIN_DASHBOARD) await initAdmin();
    } catch (error) {
      console.warn('[KF CMS]', error);
      fallback('目前暫時無法連線，仍可瀏覽頁面上的固定內容。');
    }
  }
  function fallback(message) {
    document.querySelectorAll('[data-cms-status]').forEach((el) => setStatus(el, message, 'muted'));
  }
  async function syncUser(user) {
    state.user = user;
    state.role = 'guest';
    if (!user || !state.client) return;
    const { data } = await state.client.from('profiles').select('role,display_name').eq('id', user.id).maybeSingle();
    state.role = data?.role || 'member';
  }
  function injectNav() {
    const nav = document.querySelector('#navMenu');
    if (!nav) return;
    const members = [...nav.querySelectorAll('a[href="members.html"]')];
    let member = members.shift();
    members.forEach(link => link.closest('li').remove());
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
    if (['admin', 'staff'].includes(state.role)) {
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
  function ensureTarget(id, title) {
    let target = document.getElementById(id);
    if (target) return target;
    const main = document.querySelector('main');
    if (!main) return null;
    const section = html('section', { class: 'cms-section section is-hidden' });
    const container = html('div', { class: 'container' });
    const heading = html('div', { class: 'section-header' });
    heading.append(html('h2', { class: 'section-title' }, title));
    target = html('div', { id, class: 'cms-list', 'data-cms-status': 'true' });
    container.append(heading, target);
    section.append(container);
    main.append(section);
    return target;
  }
  function makeNotice(item) {
    const article = html('article', { class: 'cms-item' });
    const meta = html('div', { class: 'cms-item-meta' }, `${esc(item.category || '堂會消息')} · ${fmt(item.published_at)}`);
    const title = html('h3', {}, item.title);
    const body = makeRichNode(item.content_html, item.content);
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
    if (!target || !state.client) return;
    const query = member
      ? state.client.from('notices').select('*').in('visibility', ['members', 'public']).order('published_at', { ascending: false })
      : state.client.from('notices').select('*').eq('visibility', 'public').order('published_at', { ascending: false });
    const { data, error } = await query;
    if (error) {
      if (target.dataset.preserve === 'true') return;
      return setStatus(target, '暫時無法載入動態通告，請稍後再試。', 'error');
    }
    if (!data?.length) {
      if (target.dataset.preserve === 'true') return;
      return setStatus(target, member ? '目前沒有會友專屬通告。' : '目前沒有新的動態通告。', 'muted');
    }
    target.replaceChildren();
    target.closest('section')?.classList.remove('is-hidden');
    data.forEach((item) => target.append(makeNotice(item)));
  }
  function makePrayerCard(item) {
    const card = html('article', { class: 'cms-item prayer-cms-item' });
    card.append(html('div', { class: 'cms-item-meta' }, `${esc(item.category || '堂會代禱')} · ${fmt(item.published_at)}`));
    card.append(html('h3', {}, item.title), makeRichNode(item.content_html, item.content));
    return card;
  }
  async function renderPrayers(target) {
    if (!target || !state.client) return;
    const inviteTarget = document.getElementById('dynamicPrayerInvitations');
    const { data, error } = await state.client.from('prayer_requests').select('*').order('published_at', { ascending: false }).limit(20);
    if (error) {
      if (target.dataset.preserve === 'true') return;
      return setStatus(target, '暫時無法載入代禱資料。', 'error');
    }
    if (!data?.length) {
      if (target.dataset.preserve === 'true') return;
      return setStatus(target, '目前沒有新的代禱事項。', 'muted');
    }
    const generalItems = data.filter((item) => item.category !== '禱告邀約');
    const inviteItems = data.filter((item) => item.category === '禱告邀約');
    if (generalItems.length) {
      target.replaceChildren();
      target.closest('section')?.classList.remove('is-hidden');
      generalItems.forEach((item) => target.append(makePrayerCard(item)));
    }
    if (inviteTarget && inviteItems.length) {
      inviteTarget.replaceChildren();
      inviteItems.forEach((item) => inviteTarget.append(makePrayerCard(item)));
    }
  }
  async function renderHome() {
    await renderNotices(ensureTarget('dynamicHomeNotices', '最新動態通告'));
  }
  async function initMembers() {
    const login = document.querySelector('#memberLogin');
    const panel = document.querySelector('#memberPanel');
    const status = document.querySelector('[data-member-status]');
    const list = document.querySelector('#memberNotices');
    const refresh = async () => {
      if (state.user) {
        login?.classList.add('is-hidden'); panel?.classList.remove('is-hidden');
        setStatus(status, `已登入：${state.user.email}（${state.role === 'admin' ? '管理員' : state.role === 'staff' ? '同工' : '會友'}）`, 'success');
        await renderNotices(list, true);
      } else {
        login?.classList.remove('is-hidden'); panel?.classList.add('is-hidden');
        setStatus(status, '請使用教會發出的會友或同工電郵登入。', 'muted');
      }
    };
    await refresh();
    document.querySelector('#memberLoginForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const { data, error } = await state.client.auth.signInWithPassword({ email: String(form.get('email')).trim(), password: String(form.get('password')) });
      if (error) return setStatus(status, '登入失敗，請檢查電郵及密碼。', 'error');
      await syncUser(data.user); injectNav(); await refresh();
    });
    document.querySelector('#memberLogout')?.addEventListener('click', async () => { await state.client.auth.signOut(); state.user = null; state.role = 'guest'; injectNav(); refresh(); });
  }
  async function initAdmin() {
    const gate = document.querySelector('#adminGate'); const app = document.querySelector('#adminApp');
    if (!state.user || !['admin', 'staff'].includes(state.role)) { gate?.classList.remove('is-hidden'); app?.classList.add('is-hidden'); return; }
    gate?.classList.add('is-hidden'); app?.classList.remove('is-hidden');
  }
  boot();
})();
