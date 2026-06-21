/* Lumenbio admin panel — members + premium codes */
(function () {
  const $ = (s) => document.querySelector(s);
  let allUsers = [];

  // toast
  const toastEl = document.getElementById('toast');
  let toastTimer;
  function toast(msg, isErr) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.toggle('err', !!isErr);
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
  }

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function renderUsers(list) {
    const body = document.getElementById('users-body');
    if (!list.length) { body.innerHTML = '<tr><td colspan="5" class="admin-empty">No members yet.</td></tr>'; return; }
    body.innerHTML = list.map(u => `
      <tr>
        <td><a href="/u/${esc(u.username)}" target="_blank" class="admin-uname">${esc(u.username)}</a>${u.admin ? ' <span class="admin-tag">admin</span>' : ''}</td>
        <td class="admin-email">${esc(u.email)}</td>
        <td>${u.premium ? '<span class="plan-pill premium"><i class="fas fa-crown"></i> Premium</span>' : '<span class="plan-pill">Free</span>'}</td>
        <td>${(u.views || 0).toLocaleString()}</td>
        <td><button class="btn ${u.premium ? 'btn-ghost' : 'btn-primary'} btn-sm" data-toggle="${esc(u.username)}" data-premium="${u.premium ? '0' : '1'}">${u.premium ? 'Revoke' : 'Make Premium'}</button></td>
      </tr>`).join('');
  }

  function applySearch() {
    const q = (document.getElementById('user-search').value || '').toLowerCase();
    renderUsers(allUsers.filter(u => u.username.includes(q) || (u.email || '').toLowerCase().includes(q)));
  }

  function loadUsers() {
    return fetch('/api/admin/users').then(r => r.json()).then(d => {
      allUsers = d.users || [];
      document.getElementById('user-count').textContent = allUsers.length;
      applySearch();
    });
  }

  function renderCodes(codes) {
    const list = document.getElementById('code-list');
    if (!codes.length) { list.innerHTML = '<li class="admin-empty">No codes yet.</li>'; return; }
    list.innerHTML = codes.map(c => `
      <li class="code-item ${c.used ? 'used' : ''}">
        <code class="code-val" data-copy="${esc(c.code)}">${esc(c.code)}</code>
        <span class="code-status">${c.used ? '<i class="fas fa-circle-check"></i> used by ' + esc(c.usedBy) : '<i class="fas fa-circle"></i> available'}</span>
      </li>`).join('');
  }

  function loadCodes() {
    return fetch('/api/admin/codes').then(r => r.json()).then(d => renderCodes(d.codes || []));
  }

  document.addEventListener('DOMContentLoaded', () => {
    // Admin guard
    fetch('/api/auth/me').then(r => r.json()).then(me => {
      if (!me.user) { window.location.href = '/login'; return; }
      if (!me.user.isAdmin) { window.location.href = '/dashboard'; return; }
      loadUsers();
      loadCodes();
    });

    document.getElementById('user-search').addEventListener('input', applySearch);

    // Toggle email blur
    const toggleEmails = document.getElementById('toggle-emails');
    if (toggleEmails) toggleEmails.addEventListener('click', () => {
      const hidden = document.getElementById('admin-table-wrap').classList.toggle('emails-hidden');
      toggleEmails.innerHTML = hidden ? '<i class="fas fa-eye"></i> Show emails' : '<i class="fas fa-eye-slash"></i> Hide emails';
    });

    // Grant / revoke premium
    document.getElementById('users-body').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-toggle]');
      if (!btn) return;
      const username = btn.dataset.toggle;
      const premium = btn.dataset.premium === '1';
      btn.disabled = true;
      fetch('/api/admin/premium', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, premium }) })
        .then(r => r.json())
        .then(d => {
          if (!d.success) throw new Error(d.error || 'Failed');
          toast(`${username} → ${premium ? 'Premium' : 'Free'}`);
          loadUsers();
        })
        .catch(err => { toast(err.message, true); btn.disabled = false; });
    });

    // Generate codes
    document.getElementById('gen-btn').addEventListener('click', () => {
      const count = parseInt(document.getElementById('gen-count').value) || 5;
      fetch('/api/admin/codes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ count }) })
        .then(r => r.json())
        .then(d => { if (!d.success) throw new Error('Failed'); toast(`Generated ${d.codes.length} codes`); loadCodes(); })
        .catch(err => toast(err.message, true));
    });

    // Copy code on click
    document.getElementById('code-list').addEventListener('click', (e) => {
      const c = e.target.closest('[data-copy]');
      if (!c) return;
      (navigator.clipboard ? navigator.clipboard.writeText(c.dataset.copy) : Promise.reject())
        .then(() => toast('Code copied ✓')).catch(() => {});
    });

    // Logout
    document.getElementById('logout-btn').addEventListener('click', (e) => {
      e.preventDefault();
      fetch('/api/auth/logout', { method: 'POST' }).finally(() => { window.location.href = '/'; });
    });
  });
})();
