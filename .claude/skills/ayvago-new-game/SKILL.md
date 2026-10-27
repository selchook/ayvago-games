---
name: ayvago-new-game
description: Build a new retro arcade / action / casual / puzzle game for the Ayvago Games platform on the shared Phaser 3 + TypeScript runtime (@core), with the Ayvago boot intro, TR/EN text, touch + keyboard controls, Kenney CC0 assets and an automated smoke test. Use whenever a new game is added to ayvago-games or an existing game is reworked.
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
- **Sound.** `this.sfx(key, config?)` plays a sound and respects mute.
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
- **Look before you use.** Open the PNGs or tilesheets with the Read tool to see them before picking frames.
- **No network.** Never load anything from the network. If something is missing, draw it with Graphics/shapes, or generate a texture with `scene.make.graphics(...).generateTexture(key, w, h)`.
- **Sound.** Use sounds generously but at sane volumes. Good sources:
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

## 8. Ship

- Run `npm run registry` (validates `game.json`).
- Run `npm run build`.
- Run `npm run platform` (writes `public/games/<slug>/ayvago.json` and the platform catalog).
- Run `node scripts/gen-store-assets.mjs <slug>` (platform cover + icon + portal thumbnail).
- Run `node scripts/platform-harness.mjs <slug>` (GHA_* protocol check, embedded like ayvago.com).
- Commit `games/<slug>`, `public/games/<slug>/`, `public/thumbs/<slug>.png` and `platform/arcade-catalog.ts`. Then copy the catalog into selchook/ayvago `packages/shared/src/arcade-catalog.ts`.
