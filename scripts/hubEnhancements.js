document.addEventListener('DOMContentLoaded', () => {
  // Prefer URL; fall back to localStorage (shared with other UIs)
  const qs = new URLSearchParams(location.search);
  const tokenFromUrl = (qs.get('token') || '').trim();
  const apiFromUrl   = (qs.get('api') || '').replace(/\/+$/, '');

  let token = tokenFromUrl || '';
  let api   = apiFromUrl   || '';
  try {
    if (!token) token = localStorage.getItem('sv13.token') || '';
    if (!api)   api   = localStorage.getItem('sv13.api')   || '';
    // persist new URL values for consistency across UIs
    if (tokenFromUrl) localStorage.setItem('sv13.token', tokenFromUrl);
    if (apiFromUrl)   localStorage.setItem('sv13.api', apiFromUrl);
  } catch {/* ignore storage errors */}

  const arsenalEl = document.getElementById('arsenalCount');
  const coinsEl   = document.getElementById('coinCount');

  /* ---------- Stats: prefer backend when token+api present ---------- */
  async function fetchAndRenderStats() {
    if (!token || !api) return;

    let gotCards = false;
    let gotCoins = false;

    try {
      const r = await fetch(`${api}/me/${encodeURIComponent(token)}/stats`, { cache: 'no-store' });
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
          gotCoins = true;
        }
      }
    } catch {/* ignore; try fallback below */ }

    // Fallback: compute unique collected from /collection if needed
    if (!gotCards) {
      try {
        const r2 = await fetch(`${api}/me/${encodeURIComponent(token)}/collection`, { cache: 'no-store' });
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
      } catch {/* ignore */ }
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
      const u = new URL(a.href);
      if (token) u.searchParams.set('token', token);
      if (api)   u.searchParams.set('api', api);
      a.href = u.toString();
    } catch {
      let base = a.getAttribute('href') || '';
      const parts = [];
      if (token) parts.push(`token=${encodeURIComponent(token)}`);
      if (api)   parts.push(`api=${encodeURIComponent(api)}`);
      const sep = base.includes('?') ? '&' : '?';
      if (parts.length) a.setAttribute('href', `${base}${sep}${parts.join('&')}`);
    }
  }

  // Include Rulebook in the explicit list
  ['rulebook-link','view-collection','build-deck','leaderboard'].forEach(passBasic);

  // Also blanket-apply to any sv13-link with data-pass-params
  document.querySelectorAll('a.sv13-link[data-pass-params]').forEach(a => {
    try {
      const u = new URL(a.href);
      if (token) u.searchParams.set('token', token);
      if (api)   u.searchParams.set('api', api);
      a.href = u.toString();
    } catch {
      let base = a.getAttribute('href') || '';
      const parts = [];
      if (token) parts.push(`token=${encodeURIComponent(token)}`);
      if (api)   parts.push(`api=${encodeURIComponent(api)}`);
      const sep = base.includes('?') ? '&' : '?';
      if (parts.length) a.setAttribute('href', `${base}${sep}${parts.join('&')}`);
    }
  });

  /* ---------- Special-case: Start a Duel (ensure practice init works) ---------- */
  (function wireStartDuel() {
    const a = document.getElementById('start-duel');
    if (!a) return;

    // If we don't have both pieces, disable the link to avoid the "API not available" dialog.
    if (!token || !api) {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        alert('To start a practice duel from the Hub, your link must include both ?token= and ?api=. Open the Hub from a bot deep link or add them manually.');
      });
      a.title = 'Missing token/api in URL';
      return;
    }

    const IMG_BASE = 'https://madv313.github.io/Card-Collection-UI/images/cards';
    const u = new URL(a.href);

    // Overwrite with a clean, known-good query for practice
    u.search = '';
    u.searchParams.set('mode', 'practice');
    u.searchParams.set('token', token);
    u.searchParams.set('api', api);
    u.searchParams.set('imgbase', IMG_BASE);
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
