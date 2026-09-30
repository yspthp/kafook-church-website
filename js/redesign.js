/**
 * 迦福堂 - 重設風格專用互動與輔助功能 (redesign.js)
 */

document.addEventListener('DOMContentLoaded', () => {
  // 略過導航直接跳至主要內容
  const skipLink = document.querySelector('.skip-to-content');
  if (skipLink) {
    skipLink.addEventListener('click', (e) => {
      e.preventDefault();
      const mainContent = document.getElementById('mainContent');
      if (mainContent) {
        mainContent.setAttribute('tabindex', '-1');
        mainContent.focus();
      }
    });
  }

  // 減少動態偏好偵測
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (prefersReducedMotion.matches) {
    document.body.classList.add('reduce-motion');
  }

  // 捲動淡入：無 JS 或偏好減少動態時，內容保持直接可見
  const revealItems = document.querySelectorAll('[data-reveal]');
  if (revealItems.length && 'IntersectionObserver' in window && !prefersReducedMotion.matches) {
    document.documentElement.classList.add('js-reveal');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealItems.forEach((el) => observer.observe(el));
  }

  // 複製奉獻或聯絡帳號資訊
  const copyButtons = document.querySelectorAll('[data-copy]');
  copyButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const textToCopy = btn.getAttribute('data-copy');
      if (!textToCopy) return;

      try {
        await navigator.clipboard.writeText(textToCopy);
        const originalText = btn.innerText;
        btn.innerText = '已複製！';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.innerText = originalText;
          btn.classList.remove('copied');
        }, 2000);
      } catch (err) {
        console.error('複製失敗:', err);
      }
    });
  });
});

document.addEventListener('DOMContentLoaded', () => {
  const ticker = document.querySelector('.tb-ticker');
  const track = document.getElementById('newsTickerTrack');
  const toggle = document.getElementById('tickerToggle');
  if (!ticker || !track || !toggle) return;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = false;
  function syncMotion() {
    ticker.classList.toggle('is-animated', !motion.matches);
    ticker.classList.toggle('is-paused', paused);
    toggle.hidden = motion.matches;
    toggle.setAttribute('aria-pressed', String(paused));
    toggle.textContent = paused ? '播放跑馬燈' : '暫停跑馬燈';
  }
  toggle.addEventListener('click', () => { paused = !paused; syncMotion(); });
  motion.addEventListener('change', syncMotion);
  // Reuse only public notices already rendered by CMS; never fetch member notices.
  const source = document.getElementById('dynamicHomeNotices');
  function syncNotices() {
    const titles = source ? [...source.querySelectorAll('.cms-item h3')].slice(0, 5) : [];
    const group = document.createElement('div');
    group.className = 'tb-ticker-group';
    if (!titles.length) {
      const link = document.createElement('a');
      link.href = 'news.html';
      link.textContent = '查看教會消息與通告';
      group.append(link);
    } else group.append(...titles.map(title => {
      const link = document.createElement('a');
      link.href = 'news.html';
      link.textContent = title.textContent;
      return link;
    }));
    const copy = group.cloneNode(true);
    copy.setAttribute('aria-hidden', 'true');
    copy.inert = true;
    copy.classList.add('tb-ticker-copy');
    track.replaceChildren(group, copy);
  }
  if (source) {
    new MutationObserver(syncNotices).observe(source, {childList:true, subtree:true});
    syncNotices();
  }
  syncMotion();
});
