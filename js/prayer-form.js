document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('prayerForm');
  const status = document.getElementById('prayerFormStatus');
  if (!form || !status) return;
  const config = window.KF_SUPABASE_CONFIG;
  async function loadClient() {
    if (!config?.url || !config?.anonKey) throw new Error('未設定內容服務。');
    if (!window.supabase) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
        script.onload = resolve; script.onerror = reject; document.head.append(script);
      });
    }
    return window.supabase.createClient(config.url, config.anonKey);
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    status.textContent = '正在送出…';
    try {
      const client = await loadClient();
      const { error } = await client.from('prayer_submissions').insert({
        name: document.getElementById('prayerName').value.trim() || '弟兄／姊妹',
        fellowship: document.getElementById('prayerFellowship').value.trim() || null,
        content: document.getElementById('prayerContent').value.trim()
      });
      if (error) throw error;
      form.reset();
      status.textContent = '已送出給教會同工，謝謝你的分享。';
    } catch (error) {
      console.error('[Prayer form]', error);
      status.textContent = '暫時未能送出，請稍後再試或直接聯絡教會。';
    } finally {
      button.disabled = false;
    }
  });
});
