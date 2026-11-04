document.addEventListener('DOMContentLoaded', () => {
  const header = document.getElementById('siteHeader');
  const menu = document.getElementById('navMenu');
  let button = document.getElementById('menuToggle');
  const mobile = matchMedia('(max-width: 1400px)');
  if (header && menu && !button) {
    button = document.createElement('button');
    button.id = 'menuToggle';
    button.type = 'button';
    button.className = 'mobile-menu-toggle';
    button.innerHTML = '<span aria-hidden="true">☰</span>';
    (header.querySelector('.nav-actions') || header.querySelector('.nav-container')).append(button);
  }
  if (header && button && menu) {
    if (!menu.querySelector('a[href="contact.html"]')) {
      const item = document.createElement('li');
      item.className = 'nav-item';
      const link = document.createElement('a');
      link.className = 'nav-link';
      link.href = 'contact.html';
      link.textContent = '聯絡我們';
      item.append(link);
      menu.append(item);
    }
    menu.setAttribute('aria-label', '主要導覽');
    header.classList.add('menu-ready');
    button.setAttribute('aria-controls', 'navMenu');
    const setOpen = (open) => {
      menu.classList.toggle('active', open && mobile.matches);
      button.setAttribute('aria-expanded', String(open && mobile.matches));
      button.setAttribute('aria-label', open && mobile.matches ? '關閉導覽選單' : '開啟導覽選單');
      menu.inert = mobile.matches && !open;
    };
    setOpen(false);
    button.addEventListener('click', () => setOpen(!menu.classList.contains('active')));
    mobile.addEventListener('change', () => setOpen(false));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && menu.classList.contains('active')) {
        setOpen(false);
        button.focus();
      }
    });
    document.addEventListener('click', (e) => {
      if (!header.contains(e.target)) setOpen(false);
    });
  }
  if (header) {
    const update = () => header.classList.toggle('scrolled', scrollY > 20);
    addEventListener('scroll', update, { passive: true });
    update();
  }
  document.querySelectorAll('a[href^="#"]').forEach((anchor) =>
    anchor.addEventListener('click', (e) => {
      const id = anchor.getAttribute('href').slice(1),
        target = document.getElementById(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
      if (id === 'mainContent') {
        target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      }
    })
  );
  if (document.querySelector('.about-team-grid')) {
    const s = document.createElement('style');
    s.textContent =
      '.about-team-grid{grid-template-columns:repeat(5,minmax(0,1fr))}.about-person{min-width:0;overflow:hidden}.about-portrait{aspect-ratio:4/3;height:clamp(220px,22vw,340px);overflow:hidden}.about-portrait img{width:100%;height:100%;object-fit:cover;object-position:center top}@media(max-width:1000px){.about-team-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:600px){.about-team-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}';
    document.head.append(s);
    document.querySelectorAll('.about-person').forEach((c) => {
      const n = c.querySelector('h3'),
        r = c.querySelector('p');
      if (n?.textContent.trim() === '黃淽君' && r) r.textContent = '幹事';
    });
  }
  const scripts = [...document.scripts].map((s) => s.src);
  if (!scripts.some((src) => src.endsWith('/cms.js')) && !window.KF_ADMIN_DASHBOARD) {
    if (!document.querySelector('link[href*="cms.css"]')) {
      const cmsCss = document.createElement('link');
      cmsCss.rel = 'stylesheet';
      cmsCss.href = 'css/cms.css';
      document.head.append(cmsCss);
    }
    const config = document.createElement('script');
    config.src = 'js/supabase-config.js';
    document.head.append(config);
    config.onload = () => {
      const cms = document.createElement('script');
      cms.src = 'js/cms.js';
      document.body.append(cms);
    };
  }
});
