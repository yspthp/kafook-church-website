/* Ka Fook dynamic content, auth, member area and staff CMS. */
(function () {
  'use strict';
  const config = window.KF_SUPABASE_CONFIG;
  const page = location.pathname.split('/').pop() || 'index.html';
  const state = { client: null, user: null, role: 'guest' };
  const esc = (value) => String(value ?? '');
  const fmt = (value) => value ? new Intl.DateTimeFormat('zh-HK', { dateStyle: 'medium' }).format(new Date(value)) : '';
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
  const addScript = (src) => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src; script.onload = resolve; script.onerror = reject;
    document.head.append(script);
  });
  async function boot() {
    injectNav();
    if (!config?.url || !config?.anonKey) return fallback('未設定內容服務連線，保留原有內容。');
    try {
      if (!window.supabase) await addScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
      state.client = window.supabase.createClient(config.url, config.anonKey);
      const { data } = await state.client.auth.getSession();
      await syncUser(data.session?.user || null);
      state.client.auth.onAuthStateChange((_event, session) => syncUser(session?.user || null));
      injectNav();
      if (document.body.dataset.contentSource === 'official') return;
      if (page === 'index.html' || page === '') await renderHome();
      if (page === 'news.html') await renderNotices(ensureTarget('dynamicNotices', '最新動態通告', 'LIVE NOTICES'));
      if (page === 'events.html') await renderEvents(ensureTarget('dynamicEvents', '特別聚會與焦點活動', 'FEATURED EVENTS'));
      if (page === 'prayer.html') await renderPrayers(ensureTarget('dynamicPrayers', '最新代禱事項', 'PRAYER WALL'));
      if (page === 'members.html') await initMembers();
      if (page === 'admin.html') await initAdmin();
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
    // Reuse the static member entry; never add a second login link.
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
    } else admin?.remove();
  }
  function ensureTarget(id, title, eyebrow) {
    let target = document.getElementById(id);
    if (target) return target;
    const main = document.querySelector('main');
    if (!main) return null;
    const section = html('section', { class: 'cms-section section' });
    const container = html('div', { class: 'container' });
    const heading = html('div', { class: 'section-header' });
    heading.append(html('h2', { class: 'section-title' }, title));
    target = html('div', { id, class: 'cms-list', 'data-cms-status': '' });
    section.append(container); container.append(heading, target);
    main.append(section);
    return target;
  }
  async function select(table, options = {}) {
    let query = state.client.from(table).select('*');
    if (options.visibility) query = query.eq('visibility', options.visibility);
    if (options.order) query = query.order(options.order, { ascending: false });
    if (options.limit) query = query.limit(options.limit);
    return query;
  }
  function makeNotice(item) {
    const article = html('article', { class: 'cms-item' });
    const meta = html('div', { class: 'cms-item-meta' }, `${esc(item.category || '堂會消息')} · ${fmt(item.published_at)}`);
    const title = html('h3', {}, item.title); const body = html('p', {}, item.content);
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
    target.replaceChildren();
    const query = member
      ? state.client.from('notices').select('*').in('visibility', ['members', 'public']).order('published_at', { ascending: false })
      : state.client.from('notices').select('*').eq('visibility', 'public').order('published_at', { ascending: false });
    const { data, error } = await query;
    if (error) return setStatus(target, '暫時無法載入動態通告，請稍後再試。', 'error');
    if (!data?.length) return setStatus(target, member ? '目前沒有會友專屬通告。' : '目前沒有新的動態通告。', 'muted');
    data.forEach((item) => target.append(makeNotice(item)));
  }
  async function renderEvents(target) {
    if (!target || !state.client) return;
    target.replaceChildren();
    const { data, error } = await state.client.from('events').select('*').gte('starts_at', new Date().toISOString()).order('starts_at', { ascending: true }).limit(6);
    if (error) return setStatus(target, '暫時無法載入活動資料。', 'error');
    if (!data?.length) return setStatus(target, '目前沒有額外的特別聚會。', 'muted');
    data.forEach((item) => {
      const card = html('article', { class: 'cms-item' });
      card.append(html('div', { class: 'cms-item-meta' }, `${esc(item.category || '特別聚會')} · ${fmt(item.starts_at)}`));
      card.append(html('h3', {}, item.title), html('p', {}, `${item.location || ''}${item.description ? `｜${item.description}` : ''}`));
      target.append(card);
    });
  }
  async function renderPrayers(target) {
    if (!target || !state.client) return;
    target.replaceChildren();
    const { data, error } = await state.client.from('prayer_requests').select('*').order('published_at', { ascending: false }).limit(20);
    if (error) return setStatus(target, '暫時無法載入代禱資料。', 'error');
    if (!data?.length) return setStatus(target, '目前沒有新的代禱事項。', 'muted');
    data.forEach((item) => {
      const card = html('article', { class: 'cms-item prayer-cms-item' });
      card.append(html('div', { class: 'cms-item-meta' }, `${esc(item.category || '堂會代禱')} · ${fmt(item.published_at)}`));
      card.append(html('h3', {}, item.title), html('p', {}, item.content));
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
    const gate = document.querySelector('#adminGate'); const app = document.querySelector('#adminApp'); const status = document.querySelector('[data-admin-status]');
    if (!state.user || !['admin', 'staff'].includes(state.role)) { gate?.classList.remove('is-hidden'); app?.classList.add('is-hidden'); return; }
    gate?.classList.add('is-hidden'); app?.classList.remove('is-hidden');
    const fill = async (form, table) => {
      const values = Object.fromEntries(new FormData(form).entries()); const file = form.querySelector('input[type=file]')?.files?.[0];
      if (file) {
        const path = `${state.user.id}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, '-')}`;
        const upload = await state.client.storage.from('member-documents').upload(path, file, { upsert: false });
        if (upload.error) throw upload.error;
        values.attachment_path = path;
      }
      delete values.attachment; values.created_by = state.user.id;
      const { error } = await state.client.from(table).insert(values);
      if (error) throw error;
      form.reset(); setStatus(status, '已成功發佈。', 'success');
    };
    document.querySelector('#noticeForm')?.addEventListener('submit', async (e) => { e.preventDefault(); try { await fill(e.currentTarget, 'notices'); } catch (x) { setStatus(status, x.message || '發佈失敗。', 'error'); } });
    document.querySelector('#eventForm')?.addEventListener('submit', async (e) => { e.preventDefault(); try { await fill(e.currentTarget, 'events'); } catch (x) { setStatus(status, x.message || '發佈失敗。', 'error'); } });
    document.querySelector('#prayerFormCms')?.addEventListener('submit', async (e) => { e.preventDefault(); try { await fill(e.currentTarget, 'prayer_requests'); } catch (x) { setStatus(status, x.message || '發佈失敗。', 'error'); } });
  }
  boot();
})();
