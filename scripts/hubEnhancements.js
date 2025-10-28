document.addEventListener('DOMContentLoaded', () => {
  // Prefer URL (query or hash); fall back to localStorage (shared across UIs)
  const qs   = new URLSearchParams(location.search);
  const hash = new URLSearchParams((location.hash || '').replace(/^#/, ''));

  // Pull token/api from query → hash → storage
  let tokenFromUrl = (qs.get('token') || hash.get('token') || '').trim();

  // ✅ DECODE api from URL/hash to fix %2F slashes
  const apiRawFromUrl = (qs.get('api') || hash.get('api') || '');
  let apiFromUrl = apiRawFromUrl ? decodeURIComponent(apiRawFromUrl) : '';
  apiFromUrl = apiFromUrl.replace(/\/+$/, '');

  // Strip accidental "Bearer " prefix for safety
  if (tokenFromUrl && /^Bearer\s+/i.test(tokenFromUrl)) {
    tokenFromUrl = tokenFromUrl.replace(/^Bearer\s+/i, '').trim();
  }

  // Normalize API base to always end with /api
  function normalizeApiBase(s) {
    if (!s) return '';
    const base = s.replace(/\/+$/, '');
    return base.endsWith('/api') ? base : `${base}/api`;
  }

  // Load from storage if missing
  let token = tokenFromUrl || '';
  let api   = apiFromUrl   || '';
  try {
    if (!token) token = localStorage.getItem('sv13.token') || '';
    if (!api)   api   = localStorage.getItem('sv13.api') || '';
  } catch { /* ignore storage errors */ }

  // Final normalized API base (always /api)
  const API_BASE = normalizeApiBase(api);

  // Persist new URL values and normalized API for consistency across UIs
  try {
    if (tokenFromUrl) localStorage.setItem('sv13.token', tokenFromUrl);
    if (API_BASE)     localStorage.setItem('sv13.api', API_BASE);
  } catch { /* ignore */ }

  const arsenalEl = document.getElementById('arsenalCount');
  const coinsEl   = document.getElementById('coinCount');

  /* ---------- Stats: prefer backend when token+api present ---------- */
  async function fetchAndRenderStats() {
    if (!token || !API_BASE) return;

    let gotCards = false;

    try {
      const r = await fetch(`${API_BASE}/me/${encodeURIComponent(token)}/stats`, { cache: 'no-store' });
      if (r.ok) {
        const s = await r.json();
        const cards = Number(s.cards ?? s.collected);
        const coins = Number(s.coins ?? s.balance);

        if (Number.isFinite(cards) && arsenalEl) {
          arsenalEl.textContent = `${cards} / 127`;
          gotCards = true;
        }
        if (Number.isFinite(coins) && coinsEl) {
          coinsEl.textContent = String(coins);
        }
      }
    } catch { /* ignore; try fallback below */ }

    // Fallback: compute distinct collected from /collection if needed
    if (!gotCards) {
      try {
        const r2 = await fetch(`${API_BASE}/me/${encodeURIComponent(token)}/collection`, { cache: 'no-store' });
        if (r2.ok) {
          const list = await r2.json();
          let collected = 0;

          if (Array.isArray(list)) {
            collected = list.reduce((n, c) => n + (Number(c.owned ?? c.quantity ?? 0) > 0 ? 1 : 0), 0);
          } else if (list && typeof list === 'object') {
            collected = Object.values(list).reduce((n, v) => n + (Number(v) > 0 ? 1 : 0), 0);
          }

          if (arsenalEl) arsenalEl.textContent = `${collected} / 127`;
        }
      } catch { /* ignore */ }
    }
  }

  fetchAndRenderStats();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) fetchAndRenderStats();
  });

  /* ---------- Pass token/api to outbound links ---------- */
  function passBasic(id) {
    const a = document.getElementById(id);
    if (!a) return;
    try {
      const u = new URL(a.href, location.origin);
      if (token)    u.searchParams.set('token', token);
      if (API_BASE) u.searchParams.set('api', API_BASE);
      a.href = u.toString();
    } catch {
      let base = a.getAttribute('href') || '';
      const parts = [];
      if (token)    parts.push(`token=${encodeURIComponent(token)}`);
      if (API_BASE) parts.push(`api=${encodeURIComponent(API_BASE)}`);
      const sep = base.includes('?') ? '&' : '?';
      if (parts.length) a.setAttribute('href', `${base}${sep}${parts.join('&')}`);
    }
  }

  // Include Rulebook in the explicit list
  ['rulebook-link','view-collection','build-deck','leaderboard'].forEach(passBasic);

  // Also blanket-apply to any sv13-link with data-pass-params
  document.querySelectorAll('a.sv13-link[data-pass-params]').forEach(a => {
    try {
      const u = new URL(a.href, location.origin);
      if (token)    u.searchParams.set('token', token);
      if (API_BASE) u.searchParams.set('api', API_BASE);
      a.href = u.toString();
    } catch {
      let base = a.getAttribute('href') || '';
      const parts = [];
      if (token)    parts.push(`token=${encodeURIComponent(token)}`);
      if (API_BASE) parts.push(`api=${encodeURIComponent(API_BASE)}`);
      const sep = base.includes('?') ? '&' : '?';
      if (parts.length) a.setAttribute('href', `${base}${sep}${parts.join('&')}`);
    }
  });

  /* ---------- Special-case: Start a Duel (ensure practice init works) ---------- */
  (function wireStartDuel() {
    const a = document.getElementById('start-duel');
    if (!a) return;

    // If we don't have both pieces, disable the link to avoid the "API not available" dialog.
    if (!token || !API_BASE) {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        alert('To start a practice duel from the Hub, your link must include both ?token= and ?api=. Open the Hub from a bot deep link or add them manually.');
      });
      a.title = 'Missing token/api in URL';
      return;
    }

    const IMG_BASE = 'https://madv313.github.io/Card-Collection-UI/images/cards';
    const u = new URL(a.href, location.origin);

    // Overwrite with a clean, known-good query for practice
    u.search = '';
    u.searchParams.set('mode', 'practice');
    u.searchParams.set('token', token);
    u.searchParams.set('api', API_BASE);
    u.searchParams.set('imgbase', IMG_BASE);

    // Pass hub back to Duel-UI so it can return properly after a match
    // Use current page URL without query/hash, ensure trailing slash for GH Pages
    let hubUrl = `${location.origin}${location.pathname}`.replace(/index\.html?$/i, '');
    if (!hubUrl.endsWith('/')) hubUrl += '/';
    u.searchParams.set('hub', hubUrl);

    // Cache-buster to avoid stale session
    u.searchParams.set('ts', String(Date.now()));

    a.href = u.toString();
  })();

  /* ---------- Button tap animation ---------- */
  document.querySelectorAll('.menu-button').forEach(btn => {
    btn.addEventListener('click', () => btn.classList.add('fade-out'));
  });

  /* ---------- Background music control (autoplay-safe) ---------- */
  setupHubMusic();

  function setupHubMusic() {
    const audio = document.getElementById('hub-bgm');
    const btn   = document.getElementById('audioToggle');
    if (!audio || !btn) return;

    const STORE_KEY = 'sv13_hub_bgm.muted';

    // Restore saved preference (true/false as string)
    const stored = localStorage.getItem(STORE_KEY);
    if (stored !== null) audio.muted = (stored === 'true');

    updateBtn();

    // Best-effort autoplay (works because element can start muted)
    audio.play().catch(() => {});

    // On first user gesture: ensure playback; if user hasn't explicitly chosen mute, unmute.
    const unlock = () => {
      audio.play().catch(() => {});
      if (localStorage.getItem(STORE_KEY) !== 'true') {
        audio.muted = false;
        updateBtn();
      }
      cleanupUnlock();
    };
    function cleanupUnlock() {
      window.removeEventListener('pointerdown', unlock, opt);
      window.removeEventListener('keydown', unlock);
      document.removeEventListener('visibilitychange', vis);
    }
    const opt = { passive: true };
    window.addEventListener('pointerdown', unlock, opt);
    window.addEventListener('keydown', unlock);

    // If the tab regains visibility, retry play (Safari quirks)
    const vis = () => { if (!document.hidden) audio.play().catch(() => {}); };
    document.addEventListener('visibilitychange', vis);

    // Manual toggle
    btn.addEventListener('click', () => {
      audio.muted = !audio.muted;
      localStorage.setItem(STORE_KEY, String(audio.muted));
      updateBtn();
      audio.play().catch(() => {});
    });

    function updateBtn() {
      btn.textContent = audio.muted ? '🔇' : '🔊';
      btn.setAttribute('aria-label', audio.muted ? 'Play background music' : 'Mute background music');
    }
  }
});
