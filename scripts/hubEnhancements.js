document.addEventListener('DOMContentLoaded', () => {
  const qs    = new URLSearchParams(location.search);
  const token = qs.get('token') || '';
  const api   = (qs.get('api') || '').replace(/\/+$/, '');

  const arsenalEl = document.getElementById('arsenalCount');
  const coinsEl   = document.getElementById('coinCount');

  // ----- Stats (prefer backend when token+api present; fallback to collection)
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
    } catch {/* ignore; try fallbacks below */ }

    // Fallback: compute unique collected from /collection
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
      } catch {/* ignore */}
    }
  }

  fetchAndRenderStats();
  // Re-try when the tab becomes active (e.g., after selling cards in another tab)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) fetchAndRenderStats();
  });

  // ----- Pass token/api to outbound links
  function pass(id) {
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
  ['view-collection','build-deck','start-duel','leaderboard'].forEach(pass);

  // ----- Button tap animation
  document.querySelectorAll('.menu-button').forEach(btn => {
    btn.addEventListener('click', () => btn.classList.add('fade-out'));
  });

  // ----- Background music control (autoplay-safe)
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
