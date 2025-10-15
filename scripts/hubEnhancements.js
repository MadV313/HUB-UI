document.addEventListener('DOMContentLoaded', () => {
  // ---- Query params we’ll propagate to other UIs ----
  const qs = new URLSearchParams(window.location.search);
  const userId = qs.get('user');                    // existing param your hub uses
  const token  = qs.get('token') || '';             // new: player token
  const api    = (qs.get('api') || '').replace(/\/+$/, ''); // new: API base (trim trailing /)

  // Optional trade session params (preserved if present)
  const mode          = (qs.get('mode') || '').toLowerCase();      // e.g. "trade"
  const tradeSession  = qs.get('tradeSession') || qs.get('session') || '';
  const role          = (qs.get('role') || '').toLowerCase();

  // ---- Helpers ----
  const propagateParams = (href) => {
    if (!href) return href;
    try {
      const u = new URL(href, window.location.href);
      // Keep any existing params on the link, then merge ours
      if (userId) u.searchParams.set('user', userId);
      if (token)  u.searchParams.set('token', token);
      if (api)    u.searchParams.set('api', api);
      if (mode)   u.searchParams.set('mode', mode);
      if (tradeSession) u.searchParams.set('tradeSession', tradeSession);
      if (role)   u.searchParams.set('role', role);
      return u.toString();
    } catch {
      // Relative without base or malformed; do a safe manual append
      const hasQuery = href.includes('?');
      const parts = [];
      if (userId) parts.push(`user=${encodeURIComponent(userId)}`);
      if (token)  parts.push(`token=${encodeURIComponent(token)}`);
      if (api)    parts.push(`api=${encodeURIComponent(api)}`);
      if (mode)   parts.push(`mode=${encodeURIComponent(mode)}`);
      if (tradeSession) parts.push(`tradeSession=${encodeURIComponent(tradeSession)}`);
      if (role)   parts.push(`role=${encodeURIComponent(role)}`);
      if (!parts.length) return href;
      return href + (hasQuery ? '&' : '?') + parts.join('&');
    }
  };

  // ---- Stats population (API-first, fallback to local JSON as before) ----
  const arsenalEl = document.getElementById('arsenalCount');
  const coinsEl   = document.getElementById('coinCount');

  const applyStats = (stats) => {
    if (!stats) return;
    if (arsenalEl && (stats.cards != null || stats.collected != null)) {
      const cards = Number(stats.cards ?? stats.collected ?? 0);
      arsenalEl.textContent = `${cards} / 127`;
    }
    if (coinsEl && stats.coins != null) {
      coinsEl.textContent = String(stats.coins);
    }
  };

  const loadStats = async () => {
    // Try API/token first if available
    if (token && api) {
      try {
        const r = await fetch(`${api}/me/${encodeURIComponent(token)}/stats`, { cache: 'no-store' });
        if (r.ok) {
          const s = await r.json();
          applyStats(s);
          return; // success → stop
        }
      } catch (_) { /* swallow and fall through to local */ }
    }

    // Original local stats flow (unchanged)
    const statsUrl = `data/player_stats.json`;
    if (!userId) return;
    try {
      const res = await fetch(statsUrl);
      const data = await res.json();
      applyStats(data[userId]);
    } catch (_) {
      // ignore if local stats missing
    }
  };

  loadStats();

  // ---- Enhance menu links to carry token/api/user/trade params ----
  // Any <a> with class "menu-button" (your existing selectors)
  const links = document.querySelectorAll('a.menu-button');
  links.forEach(a => {
    a.href = propagateParams(a.getAttribute('href'));
  });

  // If you also use buttons without anchors, keep your fade-out feedback
  const buttons = document.querySelectorAll('.menu-button');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.add('fade-out');
    });
  });
});
