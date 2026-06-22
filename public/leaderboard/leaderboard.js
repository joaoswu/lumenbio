/**
 * Lumenbio — Leaderboard / Explore rendering.
 * Fetches top profiles from /api/bio/leaderboard, escapes all user-supplied
 * values (names, descriptions, image URLs) before injecting, and supports
 * client-side search.
 */
document.addEventListener('DOMContentLoaded', () => {
  const list = document.getElementById('leaderboard-list');
  if (!list) return;
  const search = document.getElementById('lb-search');
  let all = [];

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function rowHtml(item) {
    const rank = (item._rank || 0) + 1;
    const rankClass = `rank-${rank}`;
    const rankDisplay = rank <= 3
      ? `<span class="rank-badge">${rank}</span>`
      : `<span style="padding-left:10px;">${rank}</span>`;
    const isPrem = !!item.premium;
    const uname = esc(item.username);
    const avatarHTML = item.profileImage
      ? `<img src="${esc(item.profileImage)}" alt="${uname}" class="profile-avatar ${isPrem ? 'profile-avatar-premium' : ''}">`
      : `<div class="profile-avatar ${isPrem ? 'profile-avatar-premium' : ''}"><i class="fas fa-user-astronaut"></i></div>`;
    const displayName = esc(item.name || item.username);
    const description = esc(item.description || 'Welcome to my Lumenbio page ✨');
    const formattedViews = Number(item.views || 0).toLocaleString();
    let badgesHTML = '';
    if (Array.isArray(item.badges) && item.badges.length) {
      badgesHTML = `<span class="profile-badges">` +
        item.badges.map(b => `<i class="${esc(b.icon)} profile-badge" style="color:${esc(b.color)};" title="${esc(b.label)}"></i>`).join('') +
        `</span>`;
    }
    return `
      <a href="/u/${encodeURIComponent(item.username)}" class="leaderboard-row ${rankClass}">
        <div class="rank-col-val">${rankDisplay}</div>
        <div class="profile-cell">
          ${avatarHTML}
          <div class="profile-meta">
            <span class="profile-name-wrap">${displayName}${badgesHTML}</span>
            <span class="profile-username">@${uname}</span>
            <span class="profile-desc">${description}</span>
          </div>
        </div>
        <div class="views-cell">
          <span class="views-pill"><i class="fas fa-eye"></i> ${formattedViews}</span>
        </div>
      </a>`;
  }

  function render(items) {
    if (!items.length) {
      list.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-magnifying-glass" style="font-size:2rem;margin-bottom:12px;color:var(--text-3)"></i>
          <p>No profiles match your search.</p>
        </div>`;
      return;
    }
    list.innerHTML = items.map(rowHtml).join('');
  }

  function applyFilter() {
    const q = ((search && search.value) || '').trim().toLowerCase();
    if (!q) return render(all);
    render(all.filter(it =>
      (it.username || '').toLowerCase().includes(q) ||
      (it.name || '').toLowerCase().includes(q) ||
      (it.description || '').toLowerCase().includes(q)
    ));
  }

  if (search) search.addEventListener('input', applyFilter);

  fetch('/api/bio/leaderboard')
    .then(r => r.json())
    .then(data => {
      if (!data.success || !data.leaderboard || data.leaderboard.length === 0) {
        list.innerHTML = `
          <div class="empty-state">
            <i class="fas fa-users-slash" style="font-size:2rem;margin-bottom:12px;color:var(--text-3)"></i>
            <p>No profiles found on the leaderboard yet.</p>
          </div>`;
        return;
      }
      all = data.leaderboard.map((it, i) => Object.assign({ _rank: i }, it));
      render(all);
    })
    .catch(err => {
      console.error('Error loading leaderboard:', err);
      list.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-triangle-exclamation" style="font-size:2rem;margin-bottom:12px;color:var(--accent)"></i>
          <p>Failed to load the leaderboard. Please try again later.</p>
        </div>`;
    });
});
