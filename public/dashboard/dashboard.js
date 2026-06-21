/* Lumenbio dashboard — load config, bind form, save, live preview */
(function () {
  let username = null;
  let currentConfig = null;
  let musicTracks = [];
  let customLinks = [];
  let isPremium = false;
  let stripeEnabled = false;
  let dirty = false;

  const $ = (s) => document.querySelector(s);
  const fields = () => Array.from(document.querySelectorAll('[data-path]'));

  // ---- dot-path helpers ----
  const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  function setPath(obj, path, val) {
    const ks = path.split('.');
    let o = obj;
    for (let i = 0; i < ks.length - 1; i++) {
      if (typeof o[ks[i]] !== 'object' || o[ks[i]] === null) o[ks[i]] = {};
      o = o[ks[i]];
    }
    o[ks[ks.length - 1]] = val;
  }

  function fieldValue(el) {
    const type = el.dataset.type || el.type;
    if (el.type === 'checkbox') return el.checked;
    if (type === 'number' || el.type === 'range') { const n = parseFloat(el.value); return isNaN(n) ? 0 : n; }
    if (type === 'csv') return el.value.split(',').map(s => s.trim()).filter(Boolean);
    if (type === 'list') return el.value.split('\n').map(s => s.trim()).filter(Boolean);
    return el.value;
  }

  function setField(el, val) {
    const type = el.dataset.type || el.type;
    if (el.type === 'checkbox') { el.checked = !!val; return; }
    if (type === 'csv') { el.value = Array.isArray(val) ? val.join(', ') : (val || ''); }
    else if (type === 'list') { el.value = Array.isArray(val) ? val.join('\n') : (val || ''); }
    else { el.value = (val == null ? '' : val); }
    if (el.type === 'range') {
      const out = document.querySelector('[data-out="' + el.id + '"]');
      if (out) out.textContent = el.value;
    }
  }

  // ---- toast ----
  const toastEl = $('#toast');
  let toastTimer;
  function toast(msg, isErr) {
    toastEl.textContent = msg;
    toastEl.classList.toggle('err', !!isErr);
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
  }

  // ---- preview ----
  function reloadPreview() {
    const frame = $('#preview');
    if (username) frame.src = '/u/' + username + '?preview=' + Date.now();
  }

  // ---- timezone dropdown ----
  function populateTimezones(current) {
    const sel = document.getElementById('tz-select');
    if (!sel || sel.options.length) return;
    let zones = [];
    try { if (typeof Intl.supportedValuesOf === 'function') zones = Intl.supportedValuesOf('timeZone'); } catch (e) {}
    if (!zones || !zones.length) {
      zones = ['UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
        'America/Sao_Paulo', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid',
        'Europe/Moscow', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Bangkok', 'Asia/Singapore',
        'Asia/Tokyo', 'Asia/Shanghai', 'Australia/Sydney', 'Pacific/Auckland'];
    }
    if (current && zones.indexOf(current) === -1) zones = [current].concat(zones);
    const frag = document.createDocumentFragment();
    zones.forEach(z => {
      const o = document.createElement('option');
      o.value = z;
      o.textContent = z.replace(/_/g, ' ');
      frag.appendChild(o);
    });
    sel.appendChild(frag);
  }

  // ---- dirty state ----
  function setDirty(d) {
    dirty = d;
    const bar = document.getElementById('save-bar');
    const status = document.getElementById('save-status');
    if (bar) bar.classList.toggle('dirty', d);
    if (status) status.innerHTML = '<span class="save-dot"></span> ' + (d ? 'Unsaved changes' : 'All changes saved');
  }

  // ---- load ----
  function populate(config) {
    fields().forEach(el => setField(el, getPath(config, el.dataset.path)));
  }

  async function load() {
    // Auth guard
    const me = await fetch('/api/auth/me').then(r => r.json()).catch(() => ({}));
    if (!me.user) { window.location.href = '/login'; return; }
    if (me.user.isAdmin) { const al = document.getElementById('admin-link'); if (al) al.hidden = false; }

    const data = await fetch('/api/bio').then(r => r.json()).catch(() => null);
    if (!data || !data.config) { toast('Could not load your config.', true); return; }

    username = data.username;
    currentConfig = data.config;
    populateTimezones(currentConfig.profile && currentConfig.profile.timezone);
    populate(currentConfig);

    musicTracks = ((currentConfig.musicPlayer && currentConfig.musicPlayer.tracks) || []).map(normalizeTrack);
    renderTracks();

    setPremium(data.premium);
    customLinks = (Array.isArray(currentConfig.customLinks) ? currentConfig.customLinks : [])
      .map(l => ({ label: (l && l.label) || '', url: (l && l.url) || '' }));
    renderCL();
    updatePwHint();
    if (isPremium) loadAnalytics();
    initBilling();
    if (/[?&]upgraded=1/.test(location.search)) {
      toast('🎉 Welcome to Premium — all features unlocked!');
      history.replaceState(null, '', '/dashboard');
    }

    setDirty(false);

    $('#dash-username').textContent = username;
    $('#dash-views').textContent = (data.views || 0).toLocaleString() + ' views';
    const url = '/u/' + username;
    $('#public-link').textContent = 'lumenbio/u/' + username;
    $('#public-link').href = url;
    $('#open-page').href = url;
    reloadPreview();
  }

  // ---- save ----
  async function save(btn) {
    const clone = JSON.parse(JSON.stringify(currentConfig || {}));
    fields().forEach(el => setPath(clone, el.dataset.path, fieldValue(el)));
    setPath(clone, 'musicPlayer.tracks', musicTracks
      .filter(t => t.url)
      .map(t => ({ url: t.url, title: t.title || '', artist: t.artist || '', art: t.art || '' })));
    setPath(clone, 'customLinks', customLinks
      .filter(l => l.label || l.url)
      .map(l => ({ label: l.label || '', url: l.url || '' })));
    // Page password is write-only — only send it if a new one was typed.
    const pwEl = document.getElementById('page-password');
    if (pwEl && pwEl.value) setPath(clone, 'passwordProtect.password', pwEl.value);

    const original = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…'; }
    try {
      const resp = await fetch('/api/bio', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: clone })
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) throw new Error(data.error || 'Save failed.');
      currentConfig = data.config;
      populate(currentConfig);
      const pwEl = document.getElementById('page-password');
      if (pwEl) pwEl.value = '';
      updatePwHint();
      reloadPreview();
      setDirty(false);
      toast('Saved ✓ — preview updated');
    } catch (e) {
      toast(e.message, true);
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = original; }
    }
  }

  // ---- music tracks ----
  function normalizeTrack(t) {
    if (typeof t === 'string') return { url: t, title: '', artist: '', art: '' };
    return { url: (t && t.url) || '', title: (t && t.title) || '', artist: (t && t.artist) || '', art: (t && t.art) || '' };
  }

  function trackName(t) {
    if (t.title) return t.title;
    try { return decodeURIComponent(t.url.split('/').pop().split('?')[0]).replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '); }
    catch (e) { return 'Track'; }
  }

  function renderTracks() {
    const list = document.getElementById('track-list');
    if (!list) return;
    list.innerHTML = '';
    musicTracks.forEach((t, i) => {
      const li = document.createElement('li');
      li.className = 'track';
      li.innerHTML =
        '<span class="track-ico"><i class="fas fa-music"></i></span>' +
        '<div class="track-fields">' +
          '<input class="track-f" data-k="title">' +
          '<input class="track-f" data-k="artist" placeholder="Artist">' +
          '<input class="track-f track-art" data-k="art" placeholder="Album art URL (optional)">' +
        '</div>' +
        '<button type="button" class="track-del" aria-label="Remove track"><i class="fas fa-trash"></i></button>';
      const titleIn = li.querySelector('[data-k="title"]');
      titleIn.placeholder = trackName(t);
      titleIn.value = t.title || '';
      li.querySelector('[data-k="artist"]').value = t.artist || '';
      li.querySelector('[data-k="art"]').value = t.art || '';
      li.querySelectorAll('.track-f').forEach(inp => {
        inp.addEventListener('input', () => { musicTracks[i][inp.dataset.k] = inp.value; setDirty(true); });
      });
      li.querySelector('.track-del').addEventListener('click', () => { musicTracks.splice(i, 1); renderTracks(); setDirty(true); });
      list.appendChild(li);
    });
  }

  function uploadSongs(files) {
    const hint = document.getElementById('song-hint');
    const arr = Array.from(files || []);
    if (!arr.length) return;
    let done = 0;
    if (hint) hint.textContent = `Uploading 0/${arr.length}…`;
    arr.reduce((chain, file) => chain.then(() => {
      const fd = new FormData();
      fd.append('song', file);
      return fetch('/api/bio/songs', { method: 'POST', body: fd })
        .then(r => r.json())
        .then(d => {
          if (d && d.success) {
            musicTracks.push({ url: d.url, title: d.title || '', artist: '', art: '' });
            renderTracks();
            setDirty(true);
          } else {
            toast((d && d.error) || 'Upload failed', true);
          }
          done++;
          if (hint) hint.textContent = `Uploaded ${done}/${arr.length} — click to add more`;
        })
        .catch(() => { toast('Upload failed', true); });
    }), Promise.resolve()).then(() => {
      if (hint) hint.textContent = `Added ${arr.length} track${arr.length > 1 ? 's' : ''} — remember to Save`;
    });
  }

  // ---- custom links (premium) ----
  function renderCL() {
    const list = document.getElementById('cl-list');
    if (!list) return;
    list.innerHTML = '';
    customLinks.forEach((l, i) => {
      const li = document.createElement('li');
      li.className = 'cl-row';
      li.innerHTML = '<input class="cl-label" placeholder="Label"><input class="cl-url" placeholder="https://…"><button type="button" class="track-del" aria-label="Remove"><i class="fas fa-trash"></i></button>';
      li.querySelector('.cl-label').value = l.label || '';
      li.querySelector('.cl-url').value = l.url || '';
      li.querySelector('.cl-label').addEventListener('input', (e) => { customLinks[i].label = e.target.value; setDirty(true); });
      li.querySelector('.cl-url').addEventListener('input', (e) => { customLinks[i].url = e.target.value; setDirty(true); });
      li.querySelector('.track-del').addEventListener('click', () => { customLinks.splice(i, 1); renderCL(); setDirty(true); });
      list.appendChild(li);
    });
  }

  function setPremium(p) {
    isPremium = !!p;
    document.body.classList.toggle('is-premium', isPremium);
    const planEl = document.getElementById('acct-plan');
    if (planEl) planEl.textContent = isPremium ? 'Premium' : 'Free';
  }

  // ---- analytics (premium) ----
  const escHtml = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function renderAnalytics(data) {
    const chart = document.getElementById('an-chart');
    const refs = document.getElementById('an-refs');
    const total = document.getElementById('an-total');
    if (!chart) return;
    if (total) total.textContent = (data.total || 0).toLocaleString();
    const max = Math.max(1, ...data.days.map(d => d.count));
    chart.innerHTML = data.days.map(d => {
      const h = Math.round((d.count / max) * 100);
      return `<div class="an-bar" title="${d.date}: ${d.count}"><span style="height:${h}%"></span></div>`;
    }).join('');
    if (refs) refs.innerHTML = data.referrers.length
      ? data.referrers.map(r => `<li><span>${escHtml(r.domain)}</span><span>${r.count}</span></li>`).join('')
      : '<li class="an-empty">No referrers yet</li>';
  }

  function loadAnalytics() {
    fetch('/api/bio/analytics').then(r => r.json())
      .then(d => { if (d && d.premium && d.data) renderAnalytics(d.data); })
      .catch(() => {});
  }

  function startCheckout() {
    fetch('/api/billing/checkout', { method: 'POST' })
      .then(r => r.json())
      .then(d => { if (d.url) window.location.href = d.url; else toast(d.error || 'Checkout unavailable', true); })
      .catch(() => toast('Checkout failed', true));
  }

  function initBilling() {
    fetch('/api/billing/config').then(r => r.json()).then(d => {
      stripeEnabled = !!d.enabled;
      const btn = document.getElementById('stripe-btn');
      if (btn && stripeEnabled && !isPremium) {
        const price = document.getElementById('stripe-price');
        if (price) price.textContent = d.priceLabel || '';
        btn.hidden = false;
      }
    }).catch(() => {});
  }

  function updatePwHint() {
    const hint = document.getElementById('pw-hint');
    if (hint) hint.textContent = (currentConfig && currentConfig.passwordProtect && currentConfig.passwordProtect.hasPassword) ? '— password set ✓' : '';
  }

  // ---- wire up ----
  document.addEventListener('DOMContentLoaded', () => {
    // range live outputs
    document.querySelectorAll('input[type=range]').forEach(el => {
      el.addEventListener('input', () => {
        const out = document.querySelector('[data-out="' + el.id + '"]');
        if (out) out.textContent = el.value;
      });
    });

    // accent swatches
    const swatches = document.getElementById('accent-swatches');
    if (swatches) {
      swatches.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-color]');
        if (!b) return;
        document.getElementById('accentColor').value = b.dataset.color;
        setDirty(true);
      });
    }

    // dirty tracking on any form change
    const editor = document.getElementById('editor');
    if (editor) {
      editor.addEventListener('input', () => setDirty(true));
      editor.addEventListener('change', () => setDirty(true));
    }

    // copy public link
    const copyBtn = document.getElementById('copy-link');
    if (copyBtn) copyBtn.addEventListener('click', () => {
      const url = window.location.origin + '/u/' + (username || '');
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject())
        .then(() => toast('Link copied ✓'))
        .catch(() => toast(url, false));
    });

    // add a custom link (premium)
    const clAdd = document.getElementById('cl-add');
    if (clAdd) clAdd.addEventListener('click', () => { customLinks.push({ label: '', url: '' }); renderCL(); setDirty(true); });

    // redeem premium code
    const redeemBtn = document.getElementById('redeem-btn');
    if (redeemBtn) redeemBtn.addEventListener('click', async () => {
      const input = document.getElementById('redeem-code');
      const code = (input.value || '').trim();
      if (!code) return toast('Enter a code first.', true);
      redeemBtn.disabled = true;
      try {
        const r = await fetch('/api/auth/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
        const d = await r.json();
        if (!r.ok || !d.success) throw new Error(d.error || 'Invalid code');
        setPremium(true);
        input.value = '';
        toast('🎉 Premium unlocked — all features are now available!');
      } catch (e) { toast(e.message, true); }
      finally { redeemBtn.disabled = false; }
    });

    // Upgrade with card (Stripe)
    const stripeBtn = document.getElementById('stripe-btn');
    if (stripeBtn) stripeBtn.addEventListener('click', startCheckout);

    // premium clicks
    document.addEventListener('click', (e) => {
      if (e.target.closest('.js-upgrade')) {
        if (stripeEnabled) { startCheckout(); return; }
        const settingsTab = document.querySelector('.rail-tab[data-tab="settings"]');
        if (settingsTab) settingsTab.click();
        const code = document.getElementById('redeem-code');
        if (code) setTimeout(() => code.focus(), 50);
        toast('Enter your premium code in Settings to unlock ✨');
        return;
      }
      if (e.target.closest('.premium-card')) {
        toast('That feature is coming soon for Premium ✨');
      }
    });

    $('#save-btn').addEventListener('click', (e) => { e.preventDefault(); save(e.currentTarget); });
    $('#save-top').addEventListener('click', (e) => { e.preventDefault(); save(e.currentTarget); });
    $('#refresh-preview').addEventListener('click', (e) => { e.preventDefault(); reloadPreview(); });

    // Song uploads
    const songFile = document.getElementById('song-file');
    if (songFile) songFile.addEventListener('change', () => { uploadSongs(songFile.files); songFile.value = ''; });

    // Tab rail switching
    const rail = document.querySelector('.dash-rail');
    const panels = document.querySelectorAll('.tab-panel');
    let accountLoaded = false;
    if (rail) {
      rail.addEventListener('click', (e) => {
        const tab = e.target.closest('.rail-tab');
        if (!tab) return;
        const name = tab.dataset.tab;
        document.querySelectorAll('.rail-tab').forEach(t => t.classList.toggle('active', t === tab));
        panels.forEach(p => { p.hidden = (p.dataset.panel !== name); });
        if (name === 'settings' && !accountLoaded) loadAccount();
      });
    }

    // Reveal blurred account values
    document.querySelectorAll('.reveal').forEach(btn => {
      btn.addEventListener('click', () => {
        const v = document.getElementById(btn.dataset.target);
        if (!v) return;
        const stillBlurred = v.classList.toggle('blurred');
        btn.innerHTML = stillBlurred ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
      });
    });

    async function loadAccount() {
      accountLoaded = true;
      try {
        const a = await fetch('/api/auth/account').then(r => r.json());
        if (a.error) throw new Error(a.error);
        $('#acct-username').textContent = a.username || '—';
        $('#acct-email').textContent = a.email || '—';
        $('#acct-since').textContent = a.createdAt ? new Date(a.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
        $('#acct-views').textContent = (a.views || 0).toLocaleString();
        $('#acct-pass').textContent = a.passwordHash || '—';
        $('#acct-cookie').textContent = a.token || '—';
        setPremium(a.premium);
      } catch (e) {
        accountLoaded = false;
        toast('Could not load account info', true);
      }
    }

    const logout = async (e) => {
      if (e) e.preventDefault();
      await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
      window.location.href = '/';
    };
    $('#logout-btn').addEventListener('click', logout);
    const logout2 = document.getElementById('logout-2');
    if (logout2) logout2.addEventListener('click', logout);

    // Ctrl/Cmd+S to save
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save($('#save-btn'));
      }
    });

    load();
  });
})();
