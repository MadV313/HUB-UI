document.addEventListener('DOMContentLoaded', () => {
  const qs   = new URLSearchParams(location.search);
  const token = qs.get('token') || '';
  const api   = (qs.get('api') || '').replace(/\/+$/, '');

  // ----- Stats (prefer backend when token+api present)
  (async () => {
    try {
      if (token && api) {
        const r = await fetch(`${api}/me/${encodeURIComponent(token)}/stats`, { cache: 'no-store' });
        if (r.ok) {
          const s = await r.json();
          const arsenal = document.getElementById('arsenalCount');
          const coins   = document.getElementById('coinCount');
          if (arsenal && s.cards != null) arsenal.textContent = `${s.cards} / 127`;
          if (coins   && s.coins != null) coins.textContent   = String(s.coins);
        }
      }
    } catch {}
  })();

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

    // Best-effort autoplay (works because element is muted)
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
