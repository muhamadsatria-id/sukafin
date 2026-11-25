(function () {
  'use strict';

  const WA_ADMIN = '6285789483844';
  const MESSAGES = {
    access: 'Halo Admin SUKAFIN, saya ingin mendapatkan akses. Username: %username%',
    password: 'Halo Admin SUKAFIN, saya lupa password. Username: %username%',
  };

  let intent = 'access';
  let dialog = null;
  let loading = null;

  function onReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function ensureDialog() {
    if (dialog) return dialog;

    dialog = document.createElement('dialog');
    dialog.id = 'wa-dialog';
    dialog.setAttribute('aria-labelledby', 'wa-title');
    dialog.setAttribute('aria-describedby', 'wa-desc');
    dialog.className = 'w-[calc(100%-2rem)] max-w-sm rounded-xl bg-light-surface-container-lowest p-gutter-xl text-light-on-surface shadow-[0_16px_48px_-8px_rgba(0,40,32,0.35)] backdrop:bg-light-primary/70';
    dialog.innerHTML = `
      <div class="mb-gutter-md flex items-center justify-between gap-gutter-sm">
        <h2 id="wa-title" class="font-headline text-headline-md">Minta akses</h2>
        <button type="button" data-wa-close aria-label="Tutup" class="flex h-8 w-8 items-center justify-center rounded-full text-light-on-surface-variant hover:bg-light-surface-container-low">&times;</button>
      </div>
      <p id="wa-desc" class="mb-gutter-md font-body text-body-sm text-light-on-surface-variant"></p>
      <form id="wa-form">
        <label class="mb-gutter-xs block font-label text-label-md" for="wa-username">Username kamu</label>
        <input id="wa-username" class="mb-gutter-md w-full rounded-lg border border-light-outline-variant bg-light-surface-container-lowest px-gutter-12 py-3 font-body text-body-md outline-none focus:border-light-primary" autocomplete="username" required>
        <button type="submit" class="w-full rounded-lg bg-light-primary py-3 font-label text-label-lg text-light-on-primary">Kirim ke WhatsApp</button>
      </form>`;
    document.body.appendChild(dialog);

    dialog.querySelector('[data-wa-close]').addEventListener('click', () => dialog.close());
    dialog.querySelector('#wa-form').addEventListener('submit', e => {
      e.preventDefault();
      const username = dialog.querySelector('#wa-username').value.trim();
      if (!username) return;
      const text = MESSAGES[intent].replace('%username%', username);
      const url = 'https://wa.me/' + WA_ADMIN + '?text=' + encodeURIComponent(text);
      const tab = window.open(url, '_blank');
      if (tab) tab.opener = null;
      else window.location.href = url;
      dialog.close();
    });

    return dialog;
  }

  function openWaRequest(nextIntent) {
    const d = ensureDialog();
    intent = MESSAGES[nextIntent] ? nextIntent : 'access';
    d.querySelector('#wa-title').textContent = intent === 'password' ? 'Lupa password' : 'Minta akses';
    d.querySelector('#wa-desc').textContent = intent === 'password'
      ? 'Masukkan username kamu. Kami akan bantu reset password lewat WhatsApp admin.'
      : 'Masukkan username yang ingin kamu daftarkan. Permintaan akan dikirim ke WhatsApp admin.';
    d.querySelector('#wa-username').value = '';
    d.showModal();
    d.querySelector('#wa-username').focus();
  }

  function ensureLoading() {
    if (loading) return loading;
    loading = document.createElement('div');
    loading.id = 'login-loading';
    loading.hidden = true;
    loading.setAttribute('role', 'status');
    loading.setAttribute('aria-live', 'polite');
    loading.className = 'fixed inset-0 z-[60] flex flex-col items-center justify-center gap-gutter-md bg-light-primary text-light-on-primary';
    loading.innerHTML = `
      <div class="relative flex h-24 w-24 items-center justify-center">
        <div class="absolute h-20 w-20 animate-ping rounded-full border-2 border-white/40" aria-hidden="true"></div>
        <img src="logo.png" alt="" class="relative h-20 w-20 animate-pulse object-contain">
      </div>
      <p class="font-label text-label-md">Memasukkan akun...</p>`;
    document.body.appendChild(loading);
    return loading;
  }

  window.openWaRequest = openWaRequest;

  window.playLoginAnimation = function (done) {
    const el = ensureLoading();
    el.hidden = false;
    window.setTimeout(() => {
      el.hidden = true;
      if (typeof done === 'function') done();
    }, 1100);
  };

  onReady(() => {
    document.querySelectorAll('[data-wa-request]').forEach(button => {
      button.addEventListener('click', () => openWaRequest(button.dataset.waRequest));
    });
  });
})();
