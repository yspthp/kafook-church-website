/* Ka Fook dynamic content, auth, member area and staff CMS (Warm Timber + DOMPurify XSS protection). */
(function () {
  'use strict';
  const config = window.KF_SUPABASE_CONFIG;
  const page = location.pathname.split('/').pop() || 'index.html';
  const state = { client: null, user: null, role: 'guest' };
  const esc = (value) => String(value ?? '');
  const fmt = (value) => value ? new Intl.DateTimeFormat('zh-HK', { dateStyle: 'medium' }).format(new Date(value)) : '';

  const rich = (value) => {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    if (window.DOMPurify) {
      return window.DOMPurify.sanitize(raw, {
        USE_PROFILES: { html: true },
        ADD_ATTR: ['target', 'rel', 'loading']
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
  function registerEditableTargets() {
    const title = document.querySelector('.page-title');
    const description = document.querySelector('.page-description');
    if (title) title.dataset.cmsKey = 'page_title';
    if (description) description.dataset.cmsKey = 'page_description';
    if (page === 'index.html' || page === '') {
      document.querySelector('.tb-hero-inner > p')?.setAttribute('data-cms-key', 'home_hero_description');
      document.querySelector('#servicesTitle')?.setAttribute('data-cms-key', 'home_services_heading');
      document.querySelector('#newsTickerTrack')?.setAttribute('data-cms-key', 'home_ticker_text');
      document.querySelector('.official-notice')?.setAttribute('data-cms-key', 'home_official_notice');
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
      const pageContent = await state.client.from('page_content').select('content_key,content_html').eq('page', page).eq('visibility', 'public');
      if (!pageContent.error) applyPageContent(pageContent.data);
      if (page === 'index.html' || page === '') await renderHome();
      if (page === 'news.html') await renderNotices(ensureTarget('dynamicNotices', '最新動態通告', 'LIVE NOTICES'));
      if (page === 'events.html') await renderEvents(ensureTarget('dynamicEvents', '特別聚會與焦點活動', 'FEATURED EVENTS'));
      if (page === 'prayer.html') await renderPrayers(ensureTarget('dynamicPrayers', '最新代禱事項', 'PRAYER WALL'));
      if (page === 'members.html') await initMembers();
      if (page === 'admin.html' && !window.KF_ADMIN_DASHBOARD) await initAdmin();
    } catch (error) {
      console.warn('[KF CMS]', error);
      fallback('目前暫時無法連線，仍可瀏覽頁面上的固定內容。');
    }
  }
  async function syncUser(user) {
    state.user = user; state.role = 'guest';
    if (user && state.client) {
      const { data } = await state.client.from('profiles').select('role,display_name').eq('id', user.id).maybeSingle();
      state.role = data?.role || user.user_metadata?.role || 'member';
      state.displayName = data?.display_name || user.email;
    }
    injectNav();
  }
  function fallback(message) {
    document.querySelectorAll('[data-cms-status]').forEach((el) => setStatus(el, message, 'muted'));
  }
  function injectNav() {
    const nav = document.querySelector('#navMenu');
    if (!nav) return;
    const members = [...nav.querySelectorAll('a[href="members.html"]')];
    let member = members.shift();
    members.forEach(link => link.closest('li').remove());
    if (!member) {
      const item = html('li', { class: 'nav-item', 'data-auth-link': '' });
      member = html('a', { class: 'nav-link', href: 'members.html' });
      item.append(member); nav.append(item);
    }
    member.textContent = '會友專區';
    member.classList.toggle('active', page === 'members.html');
    if (page === 'members.html') member.setAttribute('aria-current', 'page');
    else member.removeAttribute('aria-current');
    let admin = nav.querySelector('[data-admin-link]');
    if (state.user && ['admin', 'staff'].includes(state.role)) {
      if (!admin) {
        admin = html('li', { class: 'nav-item', 'data-admin-link': '' });
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
    target = html('div', { id, class: 'cms-list', 'data-cms-status': '' });
    section.append(container); container.append(heading, target);
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
        const { data, error } = await state.client.storage.from('member-documents').createSignedUrl(item.attachment_path, 120);
        if (error) return setStatus(article, '附件暫時無法下載。', 'error');
        window.open(data.signedUrl, '_blank', 'noopener');
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
  async function renderEvents(target) {
    if (!target || !state.client) return;
    const { data, error } = await state.client.from('events').select('*').gte('starts_at', new Date().toISOString()).order('starts_at', { ascending: true }).limit(6);
    if (error) {
      if (target.dataset.preserve === 'true') return;
      return setStatus(target, '暫時無法載入活動資料。', 'error');
    }
    if (!data?.length) {
      if (target.dataset.preserve === 'true') return;
      return setStatus(target, '目前沒有額外的特別聚會。', 'muted');
    }
    target.replaceChildren();
    target.closest('section')?.classList.remove('is-hidden');
    data.forEach((item) => {
      const card = html('article', { class: 'cms-item' });
      const meta = `${esc(item.category || '特別聚會')} · ${fmt(item.starts_at)}${item.location ? ` · ${esc(item.location)}` : ''}`;
      card.append(html('div', { class: 'cms-item-meta' }, meta));
      card.append(html('h3', {}, item.title), makeRichNode(item.content_html, item.description));
      target.append(card);
    });
  }
  async function renderPrayers(target) {
    if (!target || !state.client) return;
    const { data, error } = await state.client.from('prayer_requests').select('*').order('published_at', { ascending: false }).limit(20);
    if (error) {
      if (target.dataset.preserve === 'true') return;
      return setStatus(target, '暫時無法載入代禱資料。', 'error');
    }
    if (!data?.length) {
      if (target.dataset.preserve === 'true') return;
      return setStatus(target, '目前沒有新的代禱事項。', 'muted');
    }
    target.replaceChildren();
    target.closest('section')?.classList.remove('is-hidden');
    data.forEach((item) => {
      const card = html('article', { class: 'cms-item prayer-cms-item' });
      card.append(html('div', { class: 'cms-item-meta' }, `${esc(item.category || '堂會代禱')} · ${fmt(item.published_at)}`));
      card.append(html('h3', {}, item.title), makeRichNode(item.content_html, item.content));
      target.append(card);
    });
  }
  async function renderHome() {
    await renderNotices(ensureTarget('dynamicHomeNotices', '最新動態通告', 'LATEST NOTICES'));
    await renderEvents(ensureTarget('dynamicHomeEvents', '近期特別聚會', 'UPCOMING EVENTS'));
  }
  async function initMembers() {
    const login = document.querySelector('#memberLogin');
    const panel = document.querySelector('#memberPanel');
    const status = document.querySelector('[data-member-status]');
    const refresh = () => {
      if (state.user) { login?.classList.add('is-hidden'); panel?.classList.remove('is-hidden'); setStatus(status, `已登入：${state.displayName || state.user.email}`, 'success'); renderNotices(document.querySelector('#memberNotices'), true); }
      else { login?.classList.remove('is-hidden'); panel?.classList.add('is-hidden'); setStatus(status, '請登入以查看會友專區。', 'muted'); }
    };
    refresh();
    document.querySelector('#memberLoginForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget; setStatus(status, '登入中…');
      const { error } = await state.client.auth.signInWithPassword({ email: form.email.value.trim(), password: form.password.value });
      if (error) return setStatus(status, '登入失敗，請檢查電郵及密碼。', 'error');
      await syncUser((await state.client.auth.getUser()).data.user); injectNav(); refresh();
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
