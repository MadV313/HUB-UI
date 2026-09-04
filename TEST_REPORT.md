# REPO 11 — HUB-UI Test Report

## Automated checks completed

### JavaScript syntax

`node --check scripts/hubEnhancements.js`

Result: **PASS**

### Static architecture contract

Verified:

- no active old GitHub UI production destinations
- no active legacy ME browser contract
- no fake initial `30 / 127` value
- no fake initial `13` coin value
- Discord image path matches the real lowercase `.png` asset
- canonical API base is present
- canonical Rulebook / Collection / Deck / Stats / Duel / Leaderboard domains are present
- authoritative `POST /duel/practice` flow is present
- all DOM IDs referenced by the Hub script exist in `index.html`

Result: **PASS**

### Behavior harness

A mocked browser/API harness executed the Hub script and verified:

1. Tokenized player load
   - stats request uses canonical API root
   - `discordName` renders as `Playing as madv313`
   - `cardsCollected` renders as `27 / 127`
   - coins render from server payload

2. Old API suffix normalization
   - an incoming `https://api.sv13tcg.com/api` override is normalized to `https://api.sv13tcg.com`

3. Link propagation
   - Collection receives viewer token + canonical API
   - no ME parameter is generated
   - Rulebook receives no viewer token
   - Leaderboard remains valid with viewer personalization

4. Unique practice creation
   - Random Deck sends `POST /duel/practice`
   - request body contains `token` + `deckMode: random`
   - returned `sessionId` launches `https://duel.sv13tcg.com/` with `session`, viewer `token`, and canonical `api`

5. Invalid player
   - invalid token renders `Invalid player link`
   - Arsenal becomes `Unavailable`
   - coin display remains unavailable rather than fake zeroes

6. Public/no-player Hub
   - no player request is made
   - player identity shows `No player selected`
   - stats remain unavailable placeholders

Result: **PASS**

### CSS structural check

Verified balanced CSS braces after the responsive layout repair.

Result: **PASS**

## Live tests to run after GitHub Pages / Cloudflare cutover

1. Open the Hub from a real tokenized player link and confirm `Playing as <Discord name>`, cards, and coins match Collection / Player Stats.
2. Open Rulebook and verify the URL contains no token.
3. Open Collection, Deck Builder, and Player Stats and verify the same viewer is retained.
4. Open Leaderboard both with and without a viewer token.
5. Practice → Use Random Deck → confirm a brand-new session ID is created and Duel UI opens.
6. Practice → Use Saved Deck → confirm the saved deck is used when duel-ready and invalid saved decks are rejected without creating fake state.
7. Use `Clear / Switch Player`, then open a second player's tokenized Discord link and confirm the first identity does not reappear.
8. Verify return paths from Collection, Deck, Practice/Duel, Spectator, Summary, Stats, and Leaderboard all land on `https://sv13tcg.com` and do not replace the viewer with an opponent/spectated player.
9. Test desktop and phone widths; verify stats remain normal-sized and Hub controls remain reachable.

## Not claimed by this report

This static test pass does not simulate a live Discord token or mutate production practice-session storage. Those are intentionally reserved for the post-deployment smoke test with a real player token.
