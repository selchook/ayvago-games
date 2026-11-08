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
- **HUD.** The score is drawn top-left automatically. Lives and levels always use the standard widgets, never a text label or a game-made icon row:
  - `this.hud.setLives(lives, max?)` draws hearts in the right slot (one heart and the number above five lives; with `max`, lost lives show as empty hearts). A lost heart pops and the last one beats.
  - `this.hud.setLevel(level)` draws a flag badge with the number in the centre slot.
  - `this.hud.setCenter(str)` is for other centre info (wave, moves, distance); while it is not empty it takes the badge's place.
  - `this.hud.setRight(str)` is for other right-slot info (time, coins); hearts sit left of it.
  - Set `protected useHud = false` to draw your own.
- **Typing games.** Esc and P pause the game; a game where the player types words sets `protected pauseOnP = false` so P is a letter (Esc still pauses).
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

- **Visual style (rule).** Only games whose `genres` include `retro` keep the pixel look (Press Start 2P + Pixelify Sans, CRT scanlines, chunky square buttons, nearest-neighbour scaling). Every other game is **modern**: Fredoka titles + Nunito body, smooth (linear) scaling even for pixel packs, soft glow particles, rounded buttons and glass panels, no scanlines. The core picks the style from the genres (`src/core/style.ts`); `style: 'retro' | 'modern'` in the definition overrides it. Game code keeps naming the pixel fonts: in a modern game the core maps them to the modern ones, so `txt`, `Button`, `burst` and `addCrt` need no per-style code. Do not draw pixel-style UI (hard square frames, scanline overlays, blocky text effects) by hand in a modern game.
- **Text.** `txt(scene, x, y, str, { size, color, title, wrap })`: `title: true` gives the title font (Press Start 2P, or Fredoka in modern games), otherwise the body font (Pixelify Sans, or Nunito). All four support Turkish.
- **Effects.** `burst(scene, x, y, tint|tints[], count, speed)`, `shake(scene, intensity, ms)`, `flash(scene, color)`, `popup(scene, x, y, '+50')`.
- **UI.** `Button(scene, x, y, label, onClick, { width, height, color })`, `iconButton`.
- **Randomness.** `rng.int / pick / chance / shuffle / seeded(seed)`.
- **Text and colours.** `t('score' | 'level' | 'lives' | 'time' | 'moves' | 'wave' | 'combo' | 'next' | 'go' | …)`, `loc({tr, en})`, `upper(str)` (locale-aware), `COLORS`.
- **Controls.** `Controls` gives keyboard (arrows/WASD, Space/Z/Enter = A, X/Shift = B) plus a touch joystick and buttons. It exposes `axisX/axisY`, `left/right/up/down`, `dir4()`, `a/b` and `justA()/justB()`.
  - **Rule: every directional game uses the standard touch controls, as in `games/asteroid-storm`.** A directional game is one where the player steers a character, vehicle or ship by direction: shooters, racers, platformers, mazes, snakes, grid movers and sports players.
    - On touch, these games use `new Controls(this, { joystick: true, buttons: [...] })`: a floating stick that appears wherever the left thumb lands on the left half, plus the A/B buttons on the right.
    - With no buttons, the stick works anywhere on the screen.
    - When the buttons' default spot on the right edge would cover play (a goal, a lane), move them with `buttonPos` / `buttonScale` instead of moving the created objects. The stick never starts on the pause button (top-right 120 px).
    - Left/right-only games read `axisX`. Grid games use `StickDir` from `@core` (`new StickDir(controls, delay, rate)`, then `update(delta)` each frame): `pressed` for turning games (snake, maze), `step` to move one cell and repeat while held (Sokoban, frog hops), `latch()` after a death or a new level so a held thumb does not move on by itself. It has a dead zone with hysteresis and an axis lock, so a thumb near a diagonal never zig-zags. Keys stay on the game's own handlers or `dir4()`.
    - Do not add swipe gestures, on-screen arrow pads or "tap the left or right half" schemes for movement.
  - **Exceptions:** games where the finger directly is the control keep pointer events (`this.input.on('pointerdown', …)`): a paddle that follows the finger, aiming or slingshot drags, slicing, and tapping cells or cards in board and puzzle games. Whole-board swipes (2048, slide puzzle) are also exceptions. Add a keyboard path where it makes sense.

## 5. Assets

- **Location.** Everything is in `public/assets/kenney/<pack>/…`, all CC0. Pack list: `docs/assets/INDEX.md`. Exact files with pixel sizes: `docs/assets/<pack>.txt`, so grep there before you guess a filename. Paths are lowercase and use `_` instead of spaces.
- **Player character.** A game with a hero (runner, platformer, shooter on foot, sports player) uses
  the player's chosen character instead of a fixed sprite, when the Kenney vector style fits the
  game. There are five human figures: `adventurer` (default), `explorer`, `rookie`, `soldier`,
  `zombie`.
  - **Loading.** `loadCharacter(load, { poses })` in preload gives textures `pc-<pose>` for any of
    the 24 poses in `CHARACTER_POSES`: `stand`, `front`, `walk1/2`, `jump`, `fall`, `hit`, `duck`,
    `kick`, `hang`, `slide`, `skid`, `cheer1/2`, `hold1/2`, `action1/2`, `climb1/2`, `swim1/2`,
    `back`, `talk`. All face right except `front` and `back`. Look at
    `public/assets/characters/<id>/<pose>.png` before you pick one.
  - **Frame.** All frames share `CHARACTER_FRAME` (144x176, feet at `originY`): size the sprite by
    `standHeight`.
  - **Others.** Rivals and bots: `otherCharacters(playerCharacter())`. Online opponent:
    `peerCharacter()`.
  - **Own limbs only.** Every move is shown with the character's own pose: a kick is `kick`, a
    rope swing is `hang`, a win is `cheer1`. Never draw extra limbs, boots or hands on top of a
    character.
    - Where something meets the body, take the point from `characterRig(id)`: `kickFoot` (foot
      tip in `kick`), `hangHand` (raised fist in `hang`) or `shoulders`. Scale it and mirror it
      like the sprite, so the ball or rope touches the real foot or hand.
    - A hero whose arms must follow something continuously (a bow) uses the rig parts:
      `pc-archer` (armless, same frame), `pc-arm` and `pc-hand`, posed from
      `characterRig(id).shoulders` every frame (see `games/archery`).
    - **Facing by direction (top-down and grid games).** Right: `stand`, walking `walk1`/`walk2`;
      left: the same, flipped. Down (towards the camera): `front`, walking `walkdown1`/`walkdown2`.
      Up (away from the camera): `back`, walking `walkup1`/`walkup2`. Seen from behind, a kick is
      `backkick1` (wind-up), `backkick2` (strike), `backkick3` (follow-through).
    - If a move has no pose, add it for all five characters in `tools/import-characters.py` and
      `CHARACTER_POSES`. Never draw it in one game. Poses the Kenney pack lacks are derived there
      from `front`/`back` by moving the character's own legs (`DERIVED`).
  - **Testing.** Test with `?character=<id>`, with at least two different characters.
  - **pixelArt games.** Give the pc-* textures linear filtering
    (`setFilter(Phaser.Textures.FilterMode.LINEAR)`) so the scaled-down vector art stays smooth
    (see `games/pixel-runner/main.ts`).
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
9. **Characters move with their own limbs.** In a game with a player character, every move uses one of its poses (no extra limbs drawn on top). Screenshots with two characters show the ball, rope or tool meeting the real foot or hand.

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

**Quick chat** (`src/core/quickchat.ts`): preset phrases instead of free text, so there is nothing
to moderate. Twelve phrases (Merhaba/Hello, İyi oyunlar/Good game, Hızlı lütfen/Hurry up please …)
each have an id; only `__qc { id }` goes over the wire, the sender's seat comes from the platform, and
every player reads the phrase in their own language. To add it to an online game:
- preload: `loadQuickChat(scene.load)` (the bubble's pop sound);
- `createGame()`: `this.chat = quickChat(this, { button: { x, y }, seatAnchor: (seat) => ({ x, y, dir }) })`.
  `seatAnchor` maps a seat (numbered like `net.playerIndex`; solo: the game's own seats) to where its
  bubble points (`dir`: `up`, `down`, `left`, `right`). Pass `mySeat` when the local seat is not
  `net.playerIndex`, and `bots` (the bot seats) so bots may answer in solo play;
- solo flavour: `this.chat.botSay(seat, 'welldone', 0.5)` on game events. It is rare by design (a
  chance and a shared cooldown) and does nothing online;
- the button opens a panel of chips (C on the keyboard, arrows and Enter inside). One message per
  1.5 s; unknown ids and floods are dropped. While the panel (or a player card) is open,
  `isModalOpen(this)` is true: skip your own key and tap handling then; Esc closes it instead of pausing.

**Player cards** (`src/core/playercard.ts`): tap a seat or nameplate to open
`openPlayerCard(this, { name, color, portrait, bot, match: [{ label, value }], lifetime })`.
`portraitKey(this, 'ch-<id>-front', color)` makes a round portrait from a character pose (load
`loadCharacter(l, { id, prefix: 'ch-' + id, poses: ['front'] })` for every id); `lifetimeRows(id)`
and `recordMatch(id, { won, score })` keep the local player's record in the core storage. See
`games/okey` and `games/backgammon`.

Verify with the two-player bench, which needs no platform:
`node scripts/mp-harness.mjs --dev --shots <slug>`.
- **What it does:** it embeds two copies side by side, relays the moves with 60 ms latency
  (`--latency` changes this) and plays randomly on both.
- **What must pass:** both menus appear, the host starts, moves flow both ways, there are no
  errors, and "opponent left" ends the guest's round.
- **Screenshots:** they go to `reports/mp/`. Look at them: both screens must show the same game
  state. The solo smoke test must still pass.

## 7b. 3D games (optional)

A 3D game is still an ordinary Ayvago game: `launch()`, an `ArcadeScene` named `Play`, the HUD,
`Controls`, `t()` and the result screen all work as usual. Only the world is drawn by three.js,
through `@core/three` (`src/core/three/index.ts`). The pilot is `games/sky-road`; start from it.

- **Import.** Import from `@core/three` only in 3D games, never from `@core`, so 2D games do not
  bundle three.js. `THREE` is re-exported from there.
- **Models.** CC0 GLB kits under `public/assets/kenney`: `car-kit`, `platformer-kit` and
  `nature-kit`. `docs/assets/<kit>.txt` lists every model with its size and bounding box.
  - In preload: `loadKenney3d(load, 'car', 'car-kit', 'race')`, or `loadModel(load, key, url)`.
    Models load under the intro and are parsed before the menu opens.
  - `model(key)` returns a fresh copy; skinned models keep their own skeleton.
  - `grounded(obj)` wraps a model so it is centred on x/z and stands on y = 0, because Kenney
    pivots sit in a corner.
  - `modelClips(key)` returns its animations for `THREE.AnimationMixer`.
- **World.** In `createGame()` call `this.world = new World3D(this, { fov, background, fog })`,
  then `world.addLights()` for sky light plus a sun with soft shadows.
  - Move the camera and objects in `updateGame()`. The world renders itself after every update
    and cleans up when the scene restarts or shuts down.
  - `world.followSun(p)` keeps the shadow area on the player.
  - `world.toScreen(v)` gives game pixels for `popup()` over 3D objects.
  - `world.onFrame` is for things that move even while the game logic is idle, such as menu decor.
- **Menu decor** can be 3D as well: create a `World3D` in `menuDecor(scene)` with
  `background: null`, so the menu colour shows through.
- **Budget.** Three.js renders into its own canvas, and Phaser shows that canvas as an image at
  depth `WORLD_DEPTH` (-100).
  - Keep scenes small: a few hundred meshes, one shadow-casting sun, fog to hide the far end.
  - Recycle rows and objects instead of growing the scene.
  - `quality: 0.75` renders at a lower resolution when a scene is heavy.
- **Controls.** The standard rules apply: steering uses `Controls` with the joystick and buttons.
- **Tests.** The smoke test and the screenshot step are the same. Headless Chromium renders WebGL
  in software, so frame rates there say nothing about real devices; judge layout and visuals
  from the screenshots.

## 8. Ship

- Run `npm run registry` (validates `game.json`).
- Run `npm run build`.
- Run `npm run platform` (writes `public/games/<slug>/ayvago.json` and the platform catalog).
- Run `node scripts/gen-store-assets.mjs <slug>` (platform cover + icon + portal thumbnail).
- Run `node scripts/platform-harness.mjs <slug>` (GHA_* protocol check, embedded like ayvago.com).
- Commit `games/<slug>`, `public/games/<slug>/`, `public/thumbs/<slug>.png` and `platform/arcade-catalog.ts`. The platform pulls the catalog from `main` by itself (its "Sync arcade catalog" workflow opens the PR); never copy it by hand.
