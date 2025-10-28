<script>
document.addEventListener('DOMContentLoaded', () => {
  // Prefer URL; fall back to localStorage (shared with other UIs)
  const qs = new URLSearchParams(location.search);

  const tokenFromUrl = (qs.get('token') || '').trim();

  // Duel backend base (routes like /duel/*, /spectate/*, etc.)
  const apiFromUrl = (qs.get('api') || '').replace(/\/+$/, '');
  // NEW: Persistent-data backend base for /me/:token/* routes
  const meFromUrl  = (qs.get('me')  || '').replace(/\/+$/, '');

  // Helpers to normalize bases
  const ensureApiHasSuffix = (v) => {
    const b = (v || '').replace(/\/+$/, '');
    if (!b) return '';
    return b.endsWith('/api') ? b : `${b}/api`;
  };
  const deriveMeFromApi = (apiBase) => {
    const b = (apiBase || '').replace(/\/+$/, '');
    // If api ends with /api, strip it for ME calls (mounted at root)
    return b.endsWith('/api') ? b.slice(0, -4) : b;
  };

  let token = tokenFromUrl || '';
  let api   = apiFromUrl   || '';
  let me    = meFromUrl    || '';

  try {
    if (!token) token = localStorage.getItem('sv13.token') || '';
    if (!api)   api   = (localStorage.getItem('sv13.api') || '').replace(/\/+$/, '');
    if (!me)    me    = (localStorage.getItem('sv13.me')  || '').replace(/\/+$/, '');
  } catch { /* ignore storage errors */ }

  // Normalize api → must include /api
  if (api) api = ensureApiHasSuffix(api);

  // If no explicit ME base, derive it from API (strip /api)
  if (!me && api) me = deriveMeFromApi(api);

  // Persist any new/normalized values for consistency across UIs
  try {
    if (tokenFromUrl) localStorage.setItem('sv13.token', tokenFromUrl);
    if (apiFromUrl)   localStorage.setItem('sv13.api',   ensureApiHasSuffix(apiFromUrl));
    if (meFromUrl)    localStorage.setItem('sv13.me',    meFromUrl.replace(/\/+$/, ''));
    // Also persist derived/normalized values when they weren't provided
    if (!apiFromUrl && api) localStorage.setItem('sv13.api', api);
    if (!meFromUrl  && me ) localStorage.setItem('sv13.me',  me);
  } catch {}

  const arsenalEl = document.getElementById('arsenalCount');
  const coinsEl   = document.getElementById('coinCount');

  /* ---------- Stats: use ME base for /me/:token/* (fallback to derived api-root if needed) ---------- */
  async function fetchAndRenderStats() {
    if (!token) return;

    // Choose the base that hosts /me endpoints (mounted at ROOT, not /api)
    let meBase = (me || '').replace(/\/+$/, '');
    if (!meBase && api) meBase = deriveMeFromApi(api);
    if (!meBase) return;

    let gotCards = false;
    let gotCoins = false;

    // Try /stats first
    try {
      const r = await fetch(`${meBase}/me/${encodeURIComponent(token)}/stats`, { cache: 'no-store' });
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
      } else if (r.status === 404) {
        console.warn('[Hub] /stats 404 at', meBase, '— ME base should be the ROOT (no /api).');
      }
    } catch { /* ignore; try fallback below */ }

    // Fallback: compute unique collected from /collection if needed
    if (!gotCards) {
      try {
        const r2 = await fetch(`${meBase}/me/${encodeURIComponent(token)}/collection`, { cache: 'no-store' });
        if (r2.ok) {
          const list = await r2.json();
          let collected = 0;

          if (Array.isArray(list)) {
            collected = list.reduce((n, c) => n + (Number(c.owned ?? c.quantity ?? 0) > 0 ? 1 : 0), 0);
          } else if (list && typeof list === 'object') {
            collected = Object.values(list).reduce((n, v) => n + (Number(v) > 0 ? 1 : 0), 0);
          }

          if (arsenalEl) arsenalEl.textContent = `${collected} / 127`;
        } else if (r2.status === 404) {
          console.warn('[Hub] /collection 404 at', meBase, '— ME base should be the ROOT (no /api).');
        }
      } catch { /* ignore */ }
    }
  }

  fetchAndRenderStats();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) fetchAndRenderStats();
  });

  /* ---------- Pass token/api(+me) to outbound links ---------- */
  function addParamsToUrl(href) {
    try {
      const u = new URL(href, location.href);
      if (token) u.searchParams.set('token', token);
      if (api)   u.searchParams.set('api',   api);
      if (me)    u.searchParams.set('me',    me);
      return u.toString();
    } catch {
      // Safe fallback for relative or invalid URLs
      const parts = [];
      if (token) parts.push(`token=${encodeURIComponent(token)}`);
      if (api)   parts.push(`api=${encodeURIComponent(api)}`);
      if (me)    parts.push(`me=${encodeURIComponent(me)}`);
      const sep = href.includes('?') ? '&' : '?';
      return parts.length ? `${href}${sep}${parts.join('&')}` : href;
    }
  }

  function passBasic(id) {
    const a = document.getElementById(id);
    if (!a) return;
    a.href = addParamsToUrl(a.href);
  }

  // Include Rulebook in the explicit list
  ['rulebook-link','view-collection','build-deck','leaderboard'].forEach(passBasic);

  // Also blanket-apply to any sv13-link with data-pass-params
  document.querySelectorAll('a.sv13-link[data-pass-params]').forEach(a => {
    a.href = addParamsToUrl(a.getAttribute('href') || '');
  });

  /* ---------- Special-case: Start a Duel (ensure practice init works) ---------- */
  (function wireStartDuel() {
    const a = document.getElementById('start-duel');
    if (!a) return;

    // If we don't have duel API or token, keep UX friendly
    if (!token || !api) {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        alert('To start a practice duel from the Hub, your link must include both ?token= and ?api=. Open the Hub from a bot deep link or add them manually.');
      });
      a.title = 'Missing token/api in URL';
      return;
    }

    const IMG_BASE = 'https://madv313.github.io/Card-Collection-UI/images/cards';
    const u = new URL(a.href, location.href);

    // Overwrite with a clean, known-good query for practice
    u.search = '';
    u.searchParams.set('mode', 'practice');
    u.searchParams.set('token', token);
    u.searchParams.set('api', api);          // API *with* /api suffix
    if (me) u.searchParams.set('me', me);    // ME root (no /api)
    u.searchParams.set('imgbase', IMG_BASE);

    // Pass hub back to Duel-UI so it can return properly after a match
    const hubUrl = `${location.origin}${location.pathname}`.replace(/index\.html?$/i, '');
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

    const stored = localStorage.getItem(STORE_KEY);
    if (stored !== null) audio.muted = (stored === 'true');

    updateBtn();
    audio.play().catch(() => {});

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

    const vis = () => { if (!document.hidden) audio.play().catch(() => {}); };
    document.addEventListener('visibilitychange', vis);

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
</script>
