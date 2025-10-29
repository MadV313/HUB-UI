<script>
// HUB-UI / scripts/hubEnhancements.js — carry token/api/me through the Hub

document.addEventListener('DOMContentLoaded', () => {
  /* ---------------- helpers ---------------- */
  const trimBase = s => String(s || '').trim().replace(/\/+$/, '');
  const getParam = (u, k) => {
    try { return (new URL(u, location.href)).searchParams.get(k) || ''; } catch { return ''; }
  };
  const setIf = (key, val) => { try { if (val) localStorage.setItem(key, val); } catch{} };
  const getLS = key => { try { return localStorage.getItem(key) || ''; } catch { return ''; } };

  /* ---------------- read inputs ---------------- */
  const qs = new URLSearchParams(location.search);

  // from URL
  const tokenQ = (qs.get('token') || '').trim();
  const apiQ   = trimBase(qs.get('api') || '');
  const meQ    = trimBase(qs.get('me')  || '');

  // from referrer (helps when Spectator returns without params)
  const ref    = document.referrer || '';
  const tokenR = (getParam(ref, 'token') || '').trim();
  const apiR   = trimBase(getParam(ref, 'api') || '');
  const meR    = trimBase(getParam(ref, 'me')  || '');

  // prefer URL → referrer → localStorage
  let token = tokenQ || tokenR || getLS('sv13.token') || '';
  let api   = trimBase(apiQ || apiR || getLS('sv13.api') || '');
  let me    = trimBase(meQ  || meR  || getLS('sv13.me')  || '');

  // persist newest values
  setIf('sv13.token', token);
  setIf('sv13.api',   api);
  setIf('sv13.me',    me);

  // If Hub URL is missing any of these but we have them, inject them without reload
  (function ensureParamsOnHubUrl() {
    const needToken = !qs.get('token') && token;
    const needApi   = !qs.get('api')   && api;
    const needMe    = !qs.get('me')    && me;

    if (needToken || needApi || needMe) {
      const u = new URL(location.href);
      if (needToken) u.searchParams.set('token', token);
      if (needApi)   u.searchParams.set('api',   api);
      if (needMe)    u.searchParams.set('me',    me);
      // Do not reload; just fix address bar so future navigation inherits params
      history.replaceState(null, '', u);
    }
  })();

  /* ---------------- stats widgets ---------------- */
  const arsenalEl = document.getElementById('arsenalCount');
  const coinsEl   = document.getElementById('coinCount');

  async function fetchAndRenderStats() {
    if (!token) return;

    const base = trimBase(me || api); // /me/:token/* lives on ME if provided, else API
    if (!base) return;

    let gotCards = false;

    // Try /stats
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
        console.warn('[Hub] /stats 404 at', base, '— verify your ME base.');
      }
    } catch {}

    // Fallback /collection → unique count
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
          console.warn('[Hub] /collection 404 at', base, '— verify your ME base.');
        }
      } catch {}
    }
  }

  fetchAndRenderStats();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) fetchAndRenderStats();
  });

  /* ---------------- link param propagation ---------------- */
  const addParamsToUrl = (href) => {
    try {
      const u = new URL(href, location.href);
      if (token) u.searchParams.set('token', token);
      if (api)   u.searchParams.set('api',   api);
      if (me)    u.searchParams.set('me',    me);
      return u.toString();
    } catch {
      const parts = [];
      if (token) parts.push(`token=${encodeURIComponent(token)}`);
      if (api)   parts.push(`api=${encodeURIComponent(api)}`);
      if (me)    parts.push(`me=${encodeURIComponent(me)}`);
      const sep = (href || '').includes('?') ? '&' : '?';
      return parts.length ? `${href}${sep}${parts.join('&')}` : href;
    }
  };

  const passBasic = (id) => {
    const a = document.getElementById(id);
    if (!a) return;
    a.href = addParamsToUrl(a.getAttribute('href') || a.href || '#');
  };

  // Explicit anchors
  ['rulebook-link','view-collection','build-deck','leaderboard'].forEach(passBasic);

  // Blanket pass-through
  document.querySelectorAll('a.sv13-link[data-pass-params]').forEach(a => {
    a.href = addParamsToUrl(a.getAttribute('href') || a.href || '#');
  });

  /* ---------------- Start a Duel wiring ---------------- */
  (function wireStartDuel() {
    const a = document.getElementById('start-duel');
    if (!a) return;

    if (!token || !api) {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        alert('To start a practice duel from the Hub, your link must include both ?token= and ?api=. Open the Hub from a bot deep link or add them manually.');
      }, { passive: false });
      a.title = 'Missing token/api in URL';
      return;
    }

    const IMG_BASE = 'https://madv313.github.io/Card-Collection-UI/images/cards';
    const u = new URL(a.getAttribute('href') || a.href || location.href, location.href);

    // Clean query and set expected params
    u.search = '';
    u.searchParams.set('mode',  'practice');
    u.searchParams.set('token', token);
    u.searchParams.set('api',   api);
    if (me) u.searchParams.set('me', me);
    u.searchParams.set('imgbase', IMG_BASE);

    // Return-to-hub: keep same page path but ensure it includes params
    const hub = new URL(location.href);
    if (token) hub.searchParams.set('token', token);
    if (api)   hub.searchParams.set('api',   api);
    if (me)    hub.searchParams.set('me',    me);
    u.searchParams.set('hub', hub.toString());

    // cache-buster
    u.searchParams.set('ts', String(Date.now()));
    a.href = u.toString();
  })();

  /* ---------------- Button tap FX ---------------- */
  document.querySelectorAll('.menu-button').forEach(btn => {
    btn.addEventListener('click', () => btn.classList.add('fade-out'));
  });

  /* ---------------- BGM controls ---------------- */
  (function setupHubMusic() {
    const audio = document.getElementById('hub-bgm');
    const btn   = document.getElementById('audioToggle');
    if (!audio || !btn) return;

    const STORE_KEY = 'sv13_hub_bgm.muted';
    const stored = localStorage.getItem(STORE_KEY);
    if (stored !== null) audio.muted = (stored === 'true');

    const updateBtn = () => {
      btn.textContent = audio.muted ? '🔇' : '🔊';
      btn.setAttribute('aria-label', audio.muted ? 'Play background music' : 'Mute background music');
    };

    // best-effort autoplay while muted
    audio.play().catch(() => {});
    updateBtn();

    const opt = { passive: true };
    const vis = () => { if (!document.hidden) audio.play().catch(() => {}); };
    const unlock = () => {
      audio.play().catch(() => {});
      if (localStorage.getItem(STORE_KEY) !== 'true') {
        audio.muted = false;
        updateBtn();
      }
      window.removeEventListener('pointerdown', unlock, opt);
      window.removeEventListener('keydown', unlock);
      document.removeEventListener('visibilitychange', vis);
    };

    window.addEventListener('pointerdown', unlock, opt);
    window.addEventListener('keydown',   unlock, opt);
    document.addEventListener('visibilitychange', vis);

    btn.addEventListener('click', () => {
      audio.muted = !audio.muted;
      localStorage.setItem(STORE_KEY, String(audio.muted));
      updateBtn();
      audio.play().catch(() => {});
    });
  })();
});
</script>
