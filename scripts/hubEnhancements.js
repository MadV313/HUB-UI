// SV13 TCG HUB — canonical player hub.
// Browser-facing identity is token-only; legacy browser storage-base interpretation is removed.

(() => {
  'use strict';

  const CANONICAL_API = 'https://api.sv13tcg.com';
  const URLS = Object.freeze({
    hub: 'https://sv13tcg.com/',
    rulebook: 'https://rules.sv13tcg.com/',
    collection: 'https://collection.sv13tcg.com/',
    deck: 'https://deck.sv13tcg.com/',
    stats: 'https://stats.sv13tcg.com/',
    duel: 'https://duel.sv13tcg.com/',
    leaderboard: 'https://leaderboard.sv13tcg.com/'
  });

  const STORAGE = Object.freeze({ token: 'sv13.token', api: 'sv13.api' });

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    const params = readUrlParams();
    const storedToken = storageGet(STORAGE.token);
    const storedApi = storageGet(STORAGE.api);

    const token = String(params.token || storedToken || '').trim();
    const apiBase = resolveApiBase(params.api || storedApi || CANONICAL_API);

    if (params.token) storageSet(STORAGE.token, token);
    if (params.api && apiBase) storageSet(STORAGE.api, apiBase);
    else if (!storedApi && apiBase) storageSet(STORAGE.api, apiBase);

    const state = {
      token,
      apiBase: apiBase || CANONICAL_API,
      playerName: '',
      statsStatus: 'idle'
    };

    configureCanonicalLinks(state);
    wirePlayerRequiredGuard(state);
    wireClearPlayer();
    wirePractice(state);
    setupHubMusic();

    if (!state.token) {
      renderNoPlayer();
    } else {
      refreshPlayerStats(state);
    }

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && state.token) refreshPlayerStats(state);
    });
    window.addEventListener('focus', () => {
      if (state.token) refreshPlayerStats(state);
    });
  }

  function readUrlParams() {
    const search = new URLSearchParams(location.search);
    const hash = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
    const first = key => String(search.get(key) || hash.get(key) || '').trim();
    return { token: first('token'), api: first('api') };
  }

  function resolveApiBase(raw) {
    const candidate = String(raw || '').trim().replace(/\/+$/, '');
    if (!candidate) return CANONICAL_API;
    try {
      const u = new URL(candidate);
      const host = u.hostname.toLowerCase();
      const isCanonical = u.origin === CANONICAL_API;
      const isLocalDev = host === 'localhost' || host === '127.0.0.1';
      // Canonical production API is always the root. Old /api overrides are migration-only.
      if (isCanonical) return CANONICAL_API;
      if (isLocalDev) return u.origin + u.pathname.replace(/\/+$/, '');
    } catch (_) {}
    console.warn('[hub] Ignoring untrusted api override:', candidate);
    return CANONICAL_API;
  }

  function storageGet(key) {
    try { return localStorage.getItem(key) || ''; } catch (_) { return ''; }
  }

  function storageSet(key, value) {
    try { localStorage.setItem(key, String(value || '')); } catch (_) {}
  }

  function storageRemove(key) {
    try { localStorage.removeItem(key); } catch (_) {}
  }

  function playerUrl(base, state, { includeToken = true, includeApi = true } = {}) {
    const u = new URL(base);
    if (includeToken && state.token) u.searchParams.set('token', state.token);
    if (includeApi && state.apiBase) u.searchParams.set('api', state.apiBase);
    return u.toString();
  }

  function configureCanonicalLinks(state) {
    const rulebook = document.getElementById('rulebook-link');
    const collection = document.getElementById('view-collection');
    const deck = document.getElementById('build-deck');
    const stats = document.getElementById('player-stats');
    const leaderboard = document.getElementById('leaderboard');

    // Rulebook is intentionally public: never forward player identity or API state.
    if (rulebook) rulebook.href = URLS.rulebook;
    if (collection) collection.href = playerUrl(URLS.collection, state);
    if (deck) deck.href = playerUrl(URLS.deck, state);
    if (stats) stats.href = playerUrl(URLS.stats, state);
    // Leaderboard is public; token is optional and used only for viewer personalization.
    if (leaderboard) leaderboard.href = playerUrl(URLS.leaderboard, state, { includeToken: true, includeApi: true });
  }

  function wirePlayerRequiredGuard(state) {
    document.addEventListener('click', event => {
      const target = event.target.closest('[data-player-required]');
      if (!target || state.token) return;
      event.preventDefault();
      showNotice('No player is selected. Open a fresh tokenized SV13 link from Discord to select your player.', 'warning');
    });
  }

  async function refreshPlayerStats(state) {
    if (!state.token || state.statsStatus === 'loading') return;
    state.statsStatus = 'loading';
    setConnection('loading', 'Loading player…');
    setText('playerIdentity', 'Playing as …');
    setText('arsenalCount', 'Loading…');
    setText('coinCount', '—');

    try {
      const response = await fetch(`${state.apiBase}/me/${encodeURIComponent(state.token)}/stats`, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'omit',
        headers: { Accept: 'application/json' }
      });

      if (response.status === 404 || response.status === 401) {
        state.statsStatus = 'invalid';
        setText('playerIdentity', 'Invalid player link');
        setText('arsenalCount', 'Unavailable');
        setText('coinCount', '—');
        setConnection('error', 'Player token is invalid or no longer exists.');
        showNotice('Use /linkdeck, /mycards, /mydeck, or /mystats in Discord to open a fresh player link.', 'error');
        return;
      }

      if (!response.ok) throw new Error(`Stats request failed (${response.status})`);
      const stats = await response.json();
      const name = String(stats?.discordName || stats?.name || '').trim();
      const cardsCollected = finiteNumber(stats?.cardsCollected);
      const coins = finiteNumber(stats?.coins);

      state.playerName = name;
      state.statsStatus = 'ready';
      setText('playerIdentity', `Playing as ${name || 'Linked Player'}`);
      setText('arsenalCount', cardsCollected === null ? 'Unavailable' : `${cardsCollected} / 127`);
      setText('coinCount', coins === null ? 'Unavailable' : String(coins));

      const partial = cardsCollected === null || coins === null || !name;
      setConnection(partial ? 'partial' : 'ready', partial ? 'Connected — some player data is unavailable.' : 'Connected to SV13 TCG API');
      if (!partial) clearNotice();
    } catch (error) {
      state.statsStatus = 'error';
      setText('playerIdentity', state.playerName ? `Playing as ${state.playerName}` : 'Player data unavailable');
      setText('arsenalCount', 'Unavailable');
      setText('coinCount', '—');
      setConnection('error', 'SV13 TCG API is unavailable.');
      showNotice('Could not refresh player data. Your stored player link was preserved; retry when the API is reachable.', 'error');
      console.warn('[hub] stats refresh failed:', error?.message || error);
    }
  }

  function finiteNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function renderNoPlayer() {
    setText('playerIdentity', 'No player selected');
    setText('arsenalCount', '—');
    setText('coinCount', '—');
    setConnection('idle', 'Public Hub mode — player tools need a tokenized Discord link.');
    showNotice('Rulebook and Leaderboard are public. Open a tokenized SV13 link from Discord for Collection, Deck Builder, Player Stats, or Practice.', 'info');
  }

  function wireClearPlayer() {
    const button = document.getElementById('clearPlayer');
    if (!button) return;
    button.addEventListener('click', () => {
      storageRemove(STORAGE.token);
      // API is not player identity, but clearing it prevents a stale test override from following a shared-browser user.
      storageRemove(STORAGE.api);
      const clean = new URL(URLS.hub);
      location.assign(clean.toString());
    });
  }

  function wirePractice(state) {
    const openButton = document.getElementById('practice-duel');
    const dialog = document.getElementById('practiceDialog');
    const savedButton = document.getElementById('practiceSaved');
    const randomButton = document.getElementById('practiceRandom');
    const status = document.getElementById('practiceStatus');

    if (!openButton || !dialog || !savedButton || !randomButton || !status) return;

    openButton.addEventListener('click', async () => {
      if (!state.token) {
        showNotice('Practice requires a selected player. Open a fresh tokenized SV13 link from Discord first.', 'warning');
        return;
      }
      status.textContent = 'Checking saved deck…';
      status.dataset.state = 'loading';
      savedButton.disabled = false;
      randomButton.disabled = false;
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      await updateSavedDeckReadiness(state, savedButton, status);
    });

    savedButton.addEventListener('click', () => createPracticeSession(state, 'saved', { dialog, status, savedButton, randomButton }));
    randomButton.addEventListener('click', () => createPracticeSession(state, 'random', { dialog, status, savedButton, randomButton }));
  }

  async function updateSavedDeckReadiness(state, savedButton, status) {
    try {
      const response = await fetch(`${state.apiBase}/me/${encodeURIComponent(state.token)}/deck`, {
        cache: 'no-store',
        credentials: 'omit',
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) {
        status.textContent = 'Saved deck readiness will be validated by the server when selected.';
        status.dataset.state = 'idle';
        return;
      }
      const body = await response.json();
      const cards = Array.isArray(body?.deck?.cards) ? body.deck.cards : [];
      const total = cards.reduce((sum, card) => sum + Math.max(0, Number(card?.qty || 0)), 0);
      const copiesValid = cards.every(card => Number(card?.qty || 0) >= 1 && Number(card?.qty || 0) <= 5);
      const ready = total >= 20 && total <= 40 && copiesValid;
      savedButton.disabled = !ready;
      status.textContent = ready
        ? `Saved deck detected (${total} cards). Choose a deck to create a new session.`
        : 'Your saved deck is not duel-ready (20–40 cards, maximum 5 copies each). Random Deck is available.';
      status.dataset.state = ready ? 'ready' : 'warning';
    } catch (_) {
      status.textContent = 'Saved deck readiness could not be pre-checked; the server will validate it if selected.';
      status.dataset.state = 'warning';
    }
  }

  async function createPracticeSession(state, deckMode, ui) {
    if (!state.token) return;
    ui.savedButton.disabled = true;
    ui.randomButton.disabled = true;
    ui.status.textContent = `Creating a unique ${deckMode} practice session…`;
    ui.status.dataset.state = 'loading';

    try {
      const response = await fetch(`${state.apiBase}/duel/practice`, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'omit',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ token: state.token, deckMode })
      });

      let body = null;
      try { body = await response.json(); } catch (_) {}
      if (!response.ok) throw new Error(body?.error || `Practice session request failed (${response.status})`);

      const sessionId = String(body?.sessionId || '').trim();
      if (!sessionId) throw new Error('Server created no practice session ID.');

      const destination = new URL(URLS.duel);
      destination.searchParams.set('session', sessionId);
      destination.searchParams.set('token', state.token);
      destination.searchParams.set('api', state.apiBase);
      location.assign(destination.toString());
    } catch (error) {
      ui.status.textContent = error?.message || 'Could not create practice session.';
      ui.status.dataset.state = 'error';
      ui.savedButton.disabled = false;
      ui.randomButton.disabled = false;
      console.warn('[hub] practice creation failed:', error?.message || error);
    }
  }

  function setConnection(kind, text) {
    const el = document.getElementById('connectionStatus');
    if (!el) return;
    el.dataset.state = kind;
    el.textContent = text;
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function showNotice(message, kind = 'info') {
    const el = document.getElementById('hubNotice');
    if (!el) return;
    el.textContent = message;
    el.dataset.state = kind;
    el.hidden = false;
  }

  function clearNotice() {
    const el = document.getElementById('hubNotice');
    if (!el) return;
    el.textContent = '';
    el.hidden = true;
  }

  function setupHubMusic() {
    const audio = document.getElementById('hub-bgm');
    const button = document.getElementById('audioToggle');
    if (!audio || !button) return;

    const key = 'sv13_hub_bgm.muted';
    const stored = storageGet(key);
    if (stored) audio.muted = stored === 'true';
    updateButton();
    audio.play().catch(() => {});

    const unlock = () => {
      audio.play().catch(() => {});
      if (storageGet(key) !== 'true') audio.muted = false;
      updateButton();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);

    button.addEventListener('click', () => {
      audio.muted = !audio.muted;
      storageSet(key, String(audio.muted));
      updateButton();
      audio.play().catch(() => {});
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) audio.play().catch(() => {});
    });

    function updateButton() {
      button.textContent = audio.muted ? '🔇' : '🔊';
      button.setAttribute('aria-label', audio.muted ? 'Play background music' : 'Mute background music');
    }
  }
})();
