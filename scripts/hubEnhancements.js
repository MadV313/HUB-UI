// HUB-UI/scripts/hubEnhancements.js
// Reads token/api(/me) from URL (supports ?query AND #hash) → persists to localStorage →
// renders stats → rewrites links (Rulebook, View, Build, Leaderboard, Start a Duel) to include params.

document.addEventListener('DOMContentLoaded', () => {
  // --- Helpers ---
  const stripTrailingSlashes = (s) => (s || '').replace(/\/+$/, '');
  const stripApiSuffix = (s) => stripTrailingSlashes(s || '').replace(/\/api$/i, '');

  // Parse both search (?a=b) and hash (#a=b) into a merged map (search wins on conflicts)
  function readUrlParams() {
    const search = new URLSearchParams(location.search);
    const hashRaw = (location.hash || '').replace(/^#/, '');
    const hash = new URLSearchParams(hashRaw);

    const get = (k) => {
      const v = (search.get(k) ?? '').trim();
      if (v) return v;
      const hv = (hash.get(k) ?? '').trim();
      return hv;
    };

    return {
      token: get('token') || '',
      api:   (get('api') || '').replace(/\/+$/, ''),
      me:    (get('me')  || '').replace(/\/+$/, '')
    };
  }

  // --- Param intake (URL first [search+hash], then localStorage) ---
  const { token: tokenFromUrl, api: apiFromUrl, me: meFromUrl } = readUrlParams();

  let token = tokenFromUrl || '';
  let api   = apiFromUrl   || '';
  let me    = meFromUrl    || '';

  try {
    if (!token) token = localStorage.getItem('sv13.token') || '';
    if (!api)   api   = stripTrailingSlashes(localStorage.getItem('sv13.api') || '');
    if (!me)    me    = stripTrailingSlashes(localStorage.getItem('sv13.me')  || '');

    // Persist fresh URL values for other UIs (Spectator → Hub round-trip)
    if (tokenFromUrl) localStorage.setItem('sv13.token', tokenFromUrl);
    if (apiFromUrl)   localStorage.setItem('sv13.api',   stripTrailingSlashes(apiFromUrl));
    if (meFromUrl)    localStorage.setItem('sv13.me',    stripTrailingSlashes(meFromUrl));
  } catch { /* storage disabled */ }

  // If ME base isn’t provided, derive it from API by stripping a trailing /api
  const API_BASE = stripTrailingSlashes(api);
  const ME_BASE  = stripTrailingSlashes(me || stripApiSuffix(api));

  // Quick debug to confirm params reached the Hub (remove later if noisy)
  try {
    console.log('[Hub] params:', {
      token: token ? '(set)' : '',
      API_BASE,
      ME_BASE,
      from: { search: location.search, hash: location.hash }
    });
  } catch {}

  const arsenalEl = document.getElementById('arsenalCount');
  const coinsEl   = document.getElementById('coinCount');

  // ---------- Stats: prefer ME_BASE (/me/:token/*), fallback to API_BASE ----------
  async function fetchAndRenderStats() {
    if (!token) return;
    const base = stripTrailingSlashes(ME_BASE || API_BASE);
    if (!base) return;

    let gotCards = false;

    // Try /stats first
    try {
      const r = await fetch(`${base}/me/${encodeURIComponent(token)}/stats`, { cache: 'no-store' });
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
      } else if (r.status === 404) {
        console.warn('[Hub] /stats 404 at', base, '— verify backend has /me/:token/stats.');
      }
    } catch { /* ignore; try /collection below */ }

    // Fallback: compute unique collected from /collection if needed
    if (!gotCards) {
      try {
        const r2 = await fetch(`${base}/me/${encodeURIComponent(token)}/collection`, { cache: 'no-store' });
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
          console.warn('[Hub] /collection 404 at', base, '— verify backend has /me/:token/collection.');
        }
      } catch { /* ignore */ }
    }
  }

  fetchAndRenderStats();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) fetchAndRenderStats();
  });

  // ---------- Link param propagation ----------
  function addParamsToUrl(href) {
    try {
      const u = new URL(href, location.href);
      if (token)   u.searchParams.set('token', token);
      if (API_BASE)u.searchParams.set('api',   API_BASE);
      if (ME_BASE) u.searchParams.set('me',    ME_BASE);
      return u.toString();
    } catch {
      const parts = [];
      if (token)    parts.push(`token=${encodeURIComponent(token)}`);
      if (API_BASE) parts.push(`api=${encodeURIComponent(API_BASE)}`);
      if (ME_BASE)  parts.push(`me=${encodeURIComponent(ME_BASE)}`);
      const sep = (href || '').includes('?') ? '&' : '?';
      return parts.length ? `${href}${sep}${parts.join('&')}` : href;
    }
  }

  function passBasic(id) {
    const a = document.getElementById(id);
    if (!a) return;
    a.href = addParamsToUrl(a.getAttribute('href') || a.href || '#');
  }

  // Explicit important links
  ['rulebook-link', 'view-collection', 'build-deck', 'leaderboard'].forEach(passBasic);

  // Blanket for any marked anchors
  document.querySelectorAll('a.sv13-link[data-pass-params]').forEach(a => {
    a.href = addParamsToUrl(a.getAttribute('href') || a.href || '#');
  });

  // ---------- Start a Duel (practice) ----------
  (function wireStartDuel() {
    const a = document.getElementById('start-duel');
    if (!a) return;

    if (!token || !API_BASE) {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        alert('To start a practice duel from the Hub, your link must include both ?token= and ?api=. Open the Hub from a bot deep link or add them manually.');
      });
      a.title = 'Missing token/api in URL';
      return;
    }

    const IMG_BASE = 'https://madv313.github.io/Card-Collection-UI/images/cards';
    const u = new URL(a.getAttribute('href') || a.href || location.href, location.href);

    // Overwrite with a clean, known-good query for practice
    u.search = '';
    u.searchParams.set('mode',  'practice');
    u.searchParams.set('token', token);
    u.searchParams.set('api',   API_BASE);
    if (ME_BASE) u.searchParams.set('me', ME_BASE);
    u.searchParams.set('imgbase', IMG_BASE);

    // Return-to-hub target (this page, without index.html)
    const hubUrl = `${location.origin}${location.pathname}`.replace(/index\.html?$/i, '');
    u.searchParams.set('hub', hubUrl);

    // Cache-buster
    u.searchParams.set('ts', String(Date.now()));

    a.href = u.toString();
  })();

  // ---------- Background music ----------
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
    const opt = { passive: true };
    window.addEventListener('pointerdown', unlock, opt);
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) audio.play().catch(() => {});
    });

    btn.addEventListener('click', () => {
      audio.muted = !audio.muted;
      localStorage.setItem(STORE_KEY, String(audio.muted));
      updateBtn();
      audio.play().catch(() => {});
    });

    function cleanupUnlock() {
      window.removeEventListener('pointerdown', unlock, opt);
      window.removeEventListener('keydown', unlock);
    }

    function updateBtn() {
      btn.textContent = audio.muted ? '🔇' : '🔊';
      btn.setAttribute('aria-label', audio.muted ? 'Play background music' : 'Mute background music');
    }
  }
});
