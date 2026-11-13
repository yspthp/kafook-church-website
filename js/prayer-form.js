document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('prayerForm');
  const status = document.getElementById('prayerFormStatus');
  if (!form || !status) return;

  const contactGroup = document.getElementById('prayerContactGroup');
  const contactInput = document.getElementById('prayerContact');
  const followupRadios = form.querySelectorAll('input[name="needs_followup"]');

  function syncFollowupState() {
    const selected = form.querySelector('input[name="needs_followup"]:checked');
    const wantsFollowup = selected?.value === 'yes';
    if (contactGroup) {
      contactGroup.hidden = !wantsFollowup;
      contactGroup.classList.toggle('is-hidden', !wantsFollowup);
    }
    if (contactInput) {
      contactInput.required = wantsFollowup;
      if (!wantsFollowup) contactInput.value = '';
    }
  }

  followupRadios.forEach((radio) => {
    radio.addEventListener('change', syncFollowupState);
  });
  form.addEventListener('reset', () => {
    setTimeout(syncFollowupState, 0);
  });
  syncFollowupState();

  const config = window.KF_SUPABASE_CONFIG;
  async function loadClient() {
    if (!config?.url || !config?.anonKey) throw new Error('未設定內容服務。');
    if (!window.supabase) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
        script.onload = resolve;
        script.onerror = reject;
        document.head.append(script);
      });
    }
    return window.supabase.createClient(config.url, config.anonKey);
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    syncFollowupState();
    if (!form.reportValidity()) return;

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    status.textContent = '正在送出…';

    const nameVal = document.getElementById('prayerName')?.value.trim() || '弟兄／姊妹';
    const fellowshipVal = document.getElementById('prayerFellowship')?.value.trim() || null;
    const contentVal = document.getElementById('prayerContent')?.value.trim() || '';
    const wantsFollowup = form.querySelector('input[name="needs_followup"]:checked')?.value === 'yes';
    const contactVal = wantsFollowup ? (contactInput?.value.trim() || null) : null;

    try {
      const client = await loadClient();
      const payload = {
        name: nameVal,
        fellowship: fellowshipVal,
        content: contentVal,
        needs_followup: wantsFollowup,
        contact_info: contactVal
      };

      let { error } = await client.from('prayer_submissions').insert(payload);
      if (error && (String(error.message).includes('needs_followup') || String(error.message).includes('contact_info'))) {
        const fallbackNote = wantsFollowup
          ? `\n\n【需要同工聯絡跟進｜聯絡方式：${contactVal || ''}】`
          : '\n\n【無需同工聯絡跟進】';
        const retry = await client.from('prayer_submissions').insert({
          name: nameVal,
          fellowship: fellowshipVal,
          content: `${contentVal}${fallbackNote}`
        });
        error = retry.error;
      }
      if (error) throw error;

      form.reset();
      syncFollowupState();
      status.textContent = '已送出給教會同工，謝謝你的分享。';
    } catch (error) {
      console.error('[Prayer form]', error);
      status.textContent = '暫時未能送出，請稍後再試或直接聯絡教會。';
    } finally {
      button.disabled = false;
    }
  });
});
