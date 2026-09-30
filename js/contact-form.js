// Static prototype: build a draft only; no server submission or local storage.
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('contactForm');
  if (!form) return;
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const value = id => document.getElementById(id).value.trim();
    const body = [
      '姓名：' + value('contactName'),
      '電子郵件：' + value('contactEmail'),
      '聯絡電話：' + value('contactPhone'),
      '', value('contactMessage')
    ].join('\n');
    window.location.href = 'mailto:kafookphc@kfphc.org?subject=' +
      encodeURIComponent(value('contactSubject')) + '&body=' + encodeURIComponent(body);
  });
});
