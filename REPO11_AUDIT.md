# REPO 11 — HUB-UI-main Audit & Repair

## Scope

Full extraction and top-to-bottom audit of the supplied `HUB-UI-main(2).zip`.

The supplied repository is a small static GitHub Pages app containing:

- `index.html`
- `scripts/hubEnhancements.js`
- `styles/hub.css`
- hub background / snowfall / Discord logo assets
- hub BGM

The existing visual assets, snowfall effect, Discord destination, and BGM were retained.

## Critical findings in the supplied build

### 1. Browser-facing ME architecture was still active

`hubEnhancements.js` still accepted and persisted a separate ME base, derived it from the API URL, forwarded it to every downstream UI, and read the legacy browser storage key. That conflicts with the now-canonical Duel Bot contract where browser UIs use the player token against `https://api.sv13tcg.com`.

### 2. Production destinations were still old GitHub Pages URLs

The Hub still linked directly to the old GitHub project URLs for Rulebook, Collection, Deck Builder, Duel UI, and Leaderboard.

### 3. Stats started with fake player data

`index.html` rendered `30 / 127` and `13` before any server response. A failed API request could therefore leave fake-looking live values on screen.

### 4. Rulebook propagation existed twice

There was a dedicated inline Rulebook parameter forwarder in `index.html` plus the generic propagation in `hubEnhancements.js`. The Rulebook is intended to be public and should not receive a player token.

### 5. Practice flow did not use the new session architecture

The old Hub linked directly to the Duel UI with `mode=practice`. It did not first create a unique authoritative practice session.

The current Duel Bot route contract was verified before implementing the Hub flow:

- `POST /duel/practice`
- request body: `{ token, deckMode }`
- `deckMode`: `saved` or `random`
- successful response contains `sessionId`
- launch target: `https://duel.sv13tcg.com/?session=<id>&token=<viewer>`

### 6. Discord logo path case was wrong

The actual asset is `images/logos/discord_logo.png`, while `index.html` referenced `.PNG`. That is case-sensitive on GitHub Pages.

### 7. Player identity was implicit

The Hub had no explicit `Playing as <name>` state and no shared-browser way to clear the current player token.

### 8. Mobile/fixed layout was brittle

The stylesheet used large fixed offsets (`950px`, `520px`) and a mobile stat font size of `10em`. That could push controls off-screen and badly scale the stats on smaller displays.

## Implemented repair

### Canonical architecture

- Production API defaults to `https://api.sv13tcg.com`.
- Browser player identity is token-only.
- Removed active ME-base handling and direct persistence-service interpretation.
- Old `https://api.sv13tcg.com/api` input is normalized back to the canonical API root.
- Only canonical production API or localhost development overrides are accepted.

### Canonical menu

The permanent Hub menu is now:

1. Rulebook — `https://rules.sv13tcg.com/`
2. Collection — `https://collection.sv13tcg.com/`
3. Deck Builder — `https://deck.sv13tcg.com/`
4. Player Stats — `https://stats.sv13tcg.com/`
5. Practice Duel — authoritative session creation first
6. Leaderboard — `https://leaderboard.sv13tcg.com/`

Pack Reveal, Duel Summary, and Spectator remain flow-specific and are not permanent Hub buttons.

### Player stats / identity

The Hub now begins with loading/unavailable placeholders instead of fake values and uses one canonical request:

`GET /me/:token/stats`

It consumes the server fields already used by the repaired Player Stats UI:

- `discordName`
- `coins`
- `cardsCollected`

The UI now shows:

- `Playing as <discordName>`
- connection/loading/error state
- Arsenal Unlocked
- Banked Coins
- `Clear / Switch Player`

Invalid-player and API-unavailable states no longer masquerade as valid zero-value accounts.

### Shared-browser behavior

A fresh token supplied by a new tokenized Discord link overrides the stored Hub token. `Clear / Switch Player` removes the stored player token and API override and returns to the clean public Hub, so another player can open their own tokenized link without inheriting the previous identity.

### Rulebook privacy

The Rulebook URL is now always public and receives neither token nor API query parameters.

### Leaderboard viewer personalization

Leaderboard remains public without a token. If a viewer token is present, it is forwarded only for viewer-personalized features such as `View Your Player Stats`.

### Practice session creation

`Practice Duel` now opens a deck-choice dialog:

- Use Saved Deck
- Use Random Deck

The Hub optionally pre-checks the saved deck's basic 20–40 / max-5 structure, while the Duel Bot remains authoritative.

Selecting a mode sends:

`POST https://api.sv13tcg.com/duel/practice`

with:

```json
{
  "token": "<viewer token>",
  "deckMode": "saved|random"
}
```

The returned `sessionId` is then used to open the canonical Duel UI. The Hub no longer initializes a global practice state in the Duel UI.

### Layout / assets

- Fixed the Discord logo extension case.
- Preserved the existing background, snowfall, and BGM.
- The title/subtitle remain visually supplied by the baked Hub background art instead of being duplicated over it.
- Replaced giant fixed stat sizing with a responsive bottom stat bar.
- Replaced hard fixed button offsets with responsive viewport layout.
- Added reduced-motion handling for the snowfall layer.
- Added viewport metadata for mobile.

### GitHub Pages domain

Added `CNAME` containing:

`sv13tcg.com`

## Files changed / added

- `index.html` — updated
- `scripts/hubEnhancements.js` — updated
- `styles/hub.css` — updated
- `CNAME` — new

Supporting delivery documents:

- `REPO11_AUDIT.md`
- `TEST_REPORT.md`

No unchanged media assets are included in the delivery ZIP.
