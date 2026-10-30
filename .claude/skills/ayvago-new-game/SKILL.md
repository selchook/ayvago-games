---
name: ayvago-new-game
description: Build a new retro arcade / action / casual / puzzle game for the Ayvago Games platform on the shared Phaser 3 + TypeScript runtime (@core), with the Ayvago boot intro, TR/EN text, touch + keyboard controls, CC0 assets (Kenney + the OpenGameArt packs in docs/assets/LICENSES.md) and an automated smoke test. Use whenever a new game is added to ayvago-games or an existing game is reworked.
---

# Ayvago: build a new game

Every game is a folder `games/<slug>/` that runs on the shared runtime in `src/core` (import as `@core`).
The runtime already does the following, so **don't rebuild any of it inside a game**:

- **Ayvago boot intro.** Required on every game; it is automatic through `launch()`. Never bypass or remove it. `?nointro` exists for local debugging only.
- **Flow.** Boot (preloads while the intro plays) → Menu (title, best score, how-to, sound, TR/EN) → `Play` → GameOver (score, best, retry, menu) / Pause.
- **Services.** Best-score storage, platform SDK events (`postMessage` to the host), mute, CRT scanlines, HUD, pause button, and pause on Esc/P/tab-hidden.

## 1. Scaffold

```bash
npm run new-game -- <kebab-slug> "<English Title>"
```

This creates `index.html` (don't edit it beyond the title), `game.json`, `main.ts` and `PlayScene.ts`.

## 2. game.json (catalogue metadata, validated by `npm run registry`)

- `id` must equal the folder name.
- `title` / `description` / `howTo` need **both** `tr` and `en`. The Turkish must be natural, with correct characters (ç ğ ı İ ö ş ü).
- `howTo` is shown on the menu. Keep it to 1–2 short sentences that cover BOTH touch and keyboard.
- `genres` ⊆ `arcade, action, casual, puzzle, retro, sports, strategy, card, word`.
- `orientation`: `portrait` gives a 720×1280 world, `landscape` gives 1280×720. Prefer portrait (mobile first) unless the game really needs width.

## 3. main.ts

```ts
import { launch, kenney, loadSfx, type GameMeta } from '@core';
import meta from './game.json';
import { PlayScene } from './PlayScene';

launch({
  meta: meta as GameMeta,
  background: '#0b0a1a',          // letterbox + menu colour
  pixelArt: false,                // true for 16px pixel packs (pixel-platformer, micro-roguelike, onebit)
  physics: 'arcade',              // 'arcade' (default) | 'matter' | 'none'
  gravityY: 0,
  preload(scene) {                // runs under the intro
    scene.load.image('ship', kenney('space-shooter/png/playership1_red.png'));
    scene.load.spritesheet('tiles', kenney('pixel-platformer/tilemap/tilemap_packed.png'), { frameWidth: 18, frameHeight: 18 });
    loadSfx(scene.load, 'shoot', 'sfx-digital/audio/laser4');   // no extension: .ogg + .mp3 exist
  },
  menuDecor(scene) { /* optional sprites on the menu */ },
  scenes: [PlayScene],            // one scene MUST have key 'Play'
  strings: { tr: { hint: 'İpucu' }, en: { hint: 'Hint' } },   // extra keys for t()
});
```

## 4. PlayScene.ts: extend `ArcadeScene`

```ts
import Phaser from 'phaser';
import { ArcadeScene, Controls, burst, shake, flash, popup, t, rng } from '@core';

export class PlayScene extends ArcadeScene {          // key defaults to 'Play'
  private controls!: Controls;
  createGame(): void {                                 // called on every (re)start: reset ALL state here
    this.controls = new Controls(this, { joystick: true, buttons: ['A'] });
  }
  updateGame(time: number, delta: number): void {     // not called while paused/over; delta clamped to 50ms
    if (this.controls.justA()) this.addScore(10, x, y); // popup at x,y
    if (dead) this.endGame();                          // or this.endGame({ win: true })
  }
}
```

What the base class gives you:

- **Score.** `this.score`, `addScore(n, x?, y?)`, `setScore(n)`.
- **HUD.** `this.hud.setRight(str)` for lives/level/time and `this.hud.setCenter(str)` for wave/moves. The score is drawn top-left automatically. Set `protected useHud = false` to draw your own.
- **Round state.** `this.elapsed` (seconds in round), `this.isOver`.
- **Ending.** `endGame({ win?, title?, delay? })` shows the result overlay, saves the best score and emits SDK `gameOver`.
- **Sound.** `this.sfx(key, config?)` plays a sound and respects mute. The core mixes for you:
  - Every play gets a slight random pitch (±4%) and level variation, so repeated hits never sound
    identical. Pass `exact: true` for jingles and anything musical; a sound with an explicit
    `rate` (a note) is never varied.
  - The same key twice within ~30 ms counts once, and at most 4 copies of one key play at once.
  - `this.sfxAt(key, x, config?)` pans the sound to where it happens on screen. Use it for
    collisions, explosions and pickups that are not at the centre.
  - A master compressor keeps stacked sounds from clipping, so effects can be played at real
    volumes (0.5–0.9) instead of whisper-quiet ones.
- **Pause.** Built in. Keep the top-right 120×120 px free; the pause button lives there.

Other helpers from `@core`:

- **Text.** `txt(scene, x, y, str, { size, color, title, wrap })` gives retro text: Press Start 2P with `title: true`, Pixelify Sans otherwise. Both support Turkish.
- **Effects.** `burst(scene, x, y, tint|tints[], count, speed)`, `shake(scene, intensity, ms)`, `flash(scene, color)`, `popup(scene, x, y, '+50')`.
- **UI.** `Button(scene, x, y, label, onClick, { width, height, color })`, `iconButton`.
- **Randomness.** `rng.int / pick / chance / shuffle / seeded(seed)`.
- **Text and colours.** `t('score' | 'level' | 'lives' | 'time' | 'moves' | 'wave' | 'combo' | 'next' | 'go' | …)`, `loc({tr, en})`, `upper(str)` (locale-aware), `COLORS`.
- **Controls.** `Controls` gives keyboard (arrows/WASD, Space/Z/Enter = A, X/Shift = B) plus a touch joystick and buttons. It exposes `axisX/axisY`, `left/right/up/down`, `a/b`, `justA()/justB()`. For puzzle and tap games, use pointer events directly (`this.input.on('pointerdown', …)`) and also add a keyboard path where it makes sense.

## 5. Assets

- **Location.** Everything is in `public/assets/kenney/<pack>/…`, all CC0. Pack list: `docs/assets/INDEX.md`. Exact files with pixel sizes: `docs/assets/<pack>.txt`, so grep there before you guess a filename. Paths are lowercase and use `_` instead of spaces.
- **Player character.** A game with a hero (runner, platformer, shooter on foot) uses the
  player's chosen character instead of a fixed sprite, when the Kenney vector style fits the game:
  `loadCharacter(load)` in preload gives textures `pc-stand`, `pc-front`, `pc-walk1`, `pc-walk2`,
  `pc-jump`, `pc-hit`, `pc-duck`, `pc-climb1/2`, `pc-swim1/2`. All frames share
  `CHARACTER_FRAME` (144x176, feet at `originY`): size the sprite by `standHeight`. Rivals and
  bots: `otherCharacters(playerCharacter())`; online opponent: `peerCharacter()`. Test any
  character with `?character=<id>`. A hero whose arms must hold something (a bow, a rope) uses
  the rig parts instead: `pc-archer` (armless, same frame), `pc-arm` and `pc-hand`, posed from
  `characterRig(id).shoulders` every frame (see `games/archery`). In a `pixelArt` game, give the
  pc-* textures linear filtering (`setFilter(Phaser.Textures.FilterMode.LINEAR)`) so the
  scaled-down vector art stays smooth (see `games/pixel-runner/main.ts`).
- **Look before you use.** Open the PNGs or tilesheets with the Read tool to see them before picking frames.
- **No network.** Never load anything from the network. If something is missing, draw it with Graphics/shapes, or generate a texture with `scene.make.graphics(...).generateTexture(key, w, h)`.
- **Sound.** Use sounds generously but at sane volumes. Good sources:
  - `oga/junkala-sfx` (load with `loadAudio(load, key, 'oga/junkala-sfx/<path>')`, list in `docs/assets/oga-junkala-sfx.txt`): 512 polished retro effects — coins, positive/negative stings, impacts, jumps and landings, lasers, explosions, menu sounds, alarms. Prefer these for game events; they are richer than the Kenney digital set.
  - Music is automatic (the core plays it). Pick a track only when the default does not fit: `music: { play: 'level2' }` in the game definition (`TRACKS` in `src/core/music.ts`); `false` for silence.
  - `sfx-digital`: retro lasers, power-ups, zaps.
  - `sfx-interface`: clicks, confirmations, errors.
  - `sfx-impact`
  - `jingles/audio/8-bit_jingles/jingles_nesNN`
  - `sfx-casino`: cards, chips, dice.

## 6. Quality bar (Definition of Done)

1. **Complete and fun.** Clear goal, rising difficulty or levels, a fail or finish condition that calls `endGame`, and score that means something.
2. **Juicy and retro.** Particles on hits, screen shake on big events, a sound for every action, tweens on spawn and despawn.
3. **Mobile and desktop.** Fully playable with touch only AND with keyboard (or mouse for pure point-and-click puzzles). Tap targets are at least 80 px in world units.
4. **Restart-safe.** `createGame()` resets every field, because the same scene instance is restarted. No leaked timers or listeners: use `this.time` and `this.input`, which Phaser cleans up per scene.
5. **TR + EN.** No hard-coded user-visible strings: use `t()` with `strings` or `loc()`.
6. **No console errors, no 404s.** `npx tsc --noEmit` shows no errors in your files.
7. **Smoke test passes.** `node scripts/smoke-test.mjs --dev --serial <slug>` prints PASS. It checks: intro shown → menu → play with random input → game over → retry, with no errors and a non-blank canvas.
8. **Visual check.** Take at least one gameplay screenshot with Playwright and look at it; layout must fit the 720×1280 (or 1280×720) world.

## 7. Verify

```bash
npx tsc --noEmit 2>&1 | grep "games/<slug>/" || echo "types ok"
node scripts/smoke-test.mjs --dev --serial <slug>
```

For screenshots, adapt `scripts/smoke-test.mjs`. It exposes `window.__ayvago.game`; use `?nointro` to skip the intro while iterating.

## 7a. Online two-player mode (optional)

Games with `"multiplayer": true` in game.json can be played online by two people. The player who
creates a room on ayvago.com is the **host**; a friend joins with the invite link as the **guest**.
The platform does the matchmaking and the connection. The game only exchanges small JSON
messages through `net` from `@core` (`src/core/net.ts`).

Core already handles:
- the online menu: the host presses PLAY, and the guest waits and follows;
- the shared round seed (`net.seed`);
- no pause in online play;
- "opponent left": the round ends with a notice;
- the online result screen: the host chooses REMATCH or MENU, and the guest follows.

Your PlayScene only implements the match, in `createGame()`:
- **Mode:** check `net.active`. When it is false, the game is the normal solo game; keep that
  unchanged.
- **Seat:** `net.seat` is 0 for the host and 1 for the guest. `net.isHost` is true for the host.
  `net.peerName` is the opponent's name.
- **Send:** `net.send(type, data)` sends JSON, under about 16 KB. Keep messages small and send
  real-time state at most about 20 times per second.
- **Receive:** `net.onScene(this, type, (data) => …)` listens for a message type and is removed
  automatically on restart.
- **Seed:** use `rng.seeded(net.seed)` for anything random that must match on both screens.
- **End:** both screens must agree on the result. Call
  `this.endGame({ win, title: t('youWin') | t('youLose') | t('draw') })` on both sides, normally
  after the deciding move or state message arrives.
- **Patterns:**
  - **Turn-based** (board games, alternate shots): both sides run the same rules. A player
    acts only on their turn and sends the move, and the other side applies it. Seat 0 starts
    unless the rules say otherwise; alternate the starting seat on rematches if you like.
  - **Real-time** (pong, air hockey): the **host simulates**. The guest sends its input
    (paddle position) about 20 times per second. The host sends compact state snapshots
    (positions, velocities, score) about 20 times per second. The guest renders the snapshots
    with interpolation and draws its own paddle locally for responsiveness. Mirror the field
    for the guest, so each player sees their own side at the bottom.
- **Strings:** use the core strings `t('yourTurn')`, `t('theirTurn')`, `t('you')`,
  `t('opponent')`, `t('youLose')` and `t('draw')`.
- **HUD:** show whose turn it is or the match score, and the opponent's name.

Verify with the two-player bench, which needs no platform:
`node scripts/mp-harness.mjs --dev --shots <slug>`.
- **What it does:** it embeds two copies side by side, relays the moves with 60 ms latency
  (`--latency` changes this) and plays randomly on both.
- **What must pass:** both menus appear, the host starts, moves flow both ways, there are no
  errors, and "opponent left" ends the guest's round.
- **Screenshots:** they go to `reports/mp/`. Look at them: both screens must show the same game
  state. The solo smoke test must still pass.

## 8. Ship

- Run `npm run registry` (validates `game.json`).
- Run `npm run build`.
- Run `npm run platform` (writes `public/games/<slug>/ayvago.json` and the platform catalog).
- Run `node scripts/gen-store-assets.mjs <slug>` (platform cover + icon + portal thumbnail).
- Run `node scripts/platform-harness.mjs <slug>` (GHA_* protocol check, embedded like ayvago.com).
- Commit `games/<slug>`, `public/games/<slug>/`, `public/thumbs/<slug>.png` and `platform/arcade-catalog.ts`. The platform pulls the catalog from `main` by itself (its "Sync arcade catalog" workflow opens the PR); never copy it by hand.
