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
  // menuTheme: { ... },          // optional: the game's own logo, buttons and frame (§7f)
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
  - `this.hud.setRight(str, icon?, frame?)` is for other right-slot info (time, coins), with an optional icon before the text; hearts sit left of it.
  - Set `protected useHud = false` to draw your own.
- **HUD chips (rule).** Every always-visible HUD readout sits in its own chip: frosted glass in the modern style (rounded, translucent, top sheen, hairline rim, soft shadow), a plain dark box with a 3 px border in retro. No bare floating text in the HUD.
  - `Hud` draws score, lives, level, centre and right text as chips and keeps them clear of the pause button; when the top row is full it moves the right text, then the centre, to a second row.
  - Anything game-specific (gems, keys, timer, shots, combo, a target bar) uses `hudChip(this, x, y, { align, text, icon, iconFrame, iconSize, label, color, minWidth })` from `@core`. It returns a `HudChip` (a container fixed to the camera, depth 9000): `setText`, `setIcon`, `setTextColor`, `setAnchor(x, y, align)`, `left` / `right` / `chipWidth`, and `items` to put existing objects (a bar, a row of pips) inside a chip.
  - Place them with `HUD_ROW_Y` (top row, level with the pause button), `HUD_ROW2_Y` (second row), `HUD_MARGIN`, `HUD_GAP`, `HUD_CHIP_H` and `hudRightEdge(this)`. Examples: `games/marble-maze` (gem, key, time and star chips), `games/sudoku`, `games/whack-a-mole` (a target bar in a chip), `games/pixel-runner` (a spinning coin in the right chip).
  - Transient text (banners, "+50" popups, hints, turn prompts) is not a readout and stays free.
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
    - **Driving games** (the player drives a car, truck or kart) are the one exception: they use the
      shared car steering from `@core` instead of the stick (§7d).
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
9. **HUD in chips.** Score, lives and level use `Hud`; every other always-visible readout sits in a `hudChip` (glass in modern, plain box in retro). The screenshot shows no bare HUD text and nothing under the pause button.
10. **Characters move with their own limbs.** In a game with a player character, every move uses one of its poses (no extra limbs drawn on top). Screenshots with two characters show the ball, rope or tool meeting the real foot or hand.
11. **Store art.** `node scripts/gen-store-assets.mjs <slug>` passes, the catalog cards (`card-640x360.webp`, Turkish `card-tr-640x360.webp`: the same frame) show real play with the logo clear of the action and the Turkish logo fits, and the logos (`logo-en.png`, `logo-tr.png`) read right in both languages (§8).
12. **Game guide.** `games/<slug>/guide.json` is written from the game's real code in English and Turkish, has no TODO left and `npm run validate:platform` passes it (§7i).

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

**Tables** (`"multiplayer": 3 | 4`, protocol 2.3; reference `games/okey`): `net.isTable`,
`net.seats` (bots included) and `net.playerIndex`; the host's game plays the bot seats.
- **Settings** (protocol 2.7): `net.table` is `{ hands, turnSeconds, bots }` or null (rooms, solo,
  older platforms: use the game's defaults). Play `hands` rounds and give each turn `turnSeconds`.
- **Host hand-over** (2.7): when the host's page is gone the platform makes another player host.
  `net.isHost` and `net.hostSeat` follow it; `net.onHostChange(scene, cb)` runs after they changed.
  Read `net.isHost` at every decision, never cache it: the new host's game takes over the bots,
  absent seats, resyncs and starting the next round from its own copy of the state (every game
  applies the same moves from the same seed), and a game that lost the role stops at once.
- **Leaving** (`onSeatLeave` / `onSeatJoin` in your `ArcadeScene`): a bot (the host's game) plays
  the seat until the player is back; even with `bots: false` the table must not freeze.
- **Verify** with `node scripts/table-harness.mjs --dev --shots` (Okey: three pages at one table,
  settings, a stalled tab, a leaving player, a host hand-over, no double moves).

**Two-seat tables** (`"multiplayer": 2`; reference `games/backgammon`, platform ADR 0026): a
turn-based two-player game that wants the ayvago.com lobby (open tables, quick play, invites) is
seated at a table of two instead of a room. The platform sends the seats and also `peerName` /
`peerCharacter` (the other seat), so room code keeps working; `net.isTable` is true. There are no
bots and no table settings (`net.table.bots` is false; keep the game's own match rules). Override
`onSeatLeave` to end the round as a win for the player who stayed (nobody can play the empty
seat); the leaver comes back with the table link and the host starts a rematch. Real-time games
stay in rooms. Verify with `node scripts/mp-harness.mjs --dev --shots --table <slug>` and the
plain room run.

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
- **3D people.** Use Kenney Mini Characters (`kenney/mini-characters`): rigged, with 32 clips
  (`idle`, `walk`, `sprint`, `jump`, `fall`, `crouch`, `sit`, `emote-yes`, `holding-*` …).
  - In preload, `loadCharacter3d(load)` loads the player's model: it maps the platform character
    (adventurer, explorer, rookie, soldier, zombie) to its 3D model through `CHARACTER_MODELS`.
    In the scene, `model(playerCharacter3d())` gives a copy of it. Load others with
    `loadMiniCharacter(load, name)`; `MINI_MALES` lists the male models.
  - Play every move with the model's own clips through one `AnimationMixer` per figure, never
    with added limbs. Tie the clip speed to the real speed so feet don't slide.
  - The reference is `games/golden-podium` (`athlete.ts`).
- **World.** In `createGame()` call `this.world = new World3D(this, { fov, background, fog })`,
  then `world.addLights()` for sky light plus a sun with soft shadows.
  - Move the camera and objects in `updateGame()`. The world renders itself after every update
    and cleans up when the scene restarts or shuts down.
  - That cleanup frees everything still in `world.scene` on the GPU: geometries, materials,
    textures, skeletons, instance buffers and every light's shadow map. Only the loaded models'
    own resources, shared by every copy, stay. Don't dispose these yourself on shutdown.
  - Objects you take out of the scene mid-round are yours: dispose their own geometry and
    materials when you drop them, or recycle them.
  - `world.followSun(p)` keeps the shadow area on the player.
  - `world.toScreen(v)` gives game pixels for `popup()` over 3D objects.
  - `world.setEnvironment(room)` renders a small scene into the environment map that glossy
    materials reflect, and the world frees it on shutdown. Don't build one with
    `PMREMGenerator` yourself: its render target is not freed with the texture.
  - `world.onFrame` is for things that move even while the game logic is idle, such as menu decor.
- **Menu decor** can be 3D as well: create a `World3D` in `menuDecor(scene)` with
  `background: null`, so the menu colour shows through.
- **Budget.** Three.js renders into its own canvas, and Phaser shows that canvas as an image at
  depth `WORLD_DEPTH` (-100).
  - Keep scenes small: a few hundred meshes, one shadow-casting sun, fog to hide the far end.
  - Recycle rows and objects instead of growing the scene.
  - `quality: 0.75` renders at a lower resolution when a scene is heavy.
- **Controls.** The standard rules apply: steering uses `Controls` with the joystick and buttons.
  A 3D driving game uses the car steering of §7d instead (see `games/sky-road`, `games/mud-rally`).
- **Tests.** The smoke test and the screenshot step are the same. Headless Chromium renders WebGL
  in software, so frame rates there say nothing about real devices; judge layout and visuals
  from the screenshots.

## 7c. Difficulty (optional)

Games against an AI and action games may offer **Easy / Normal**. Word and puzzle games do not.

- **Opt in.** Set `difficulty: true` in the `launch({...})` definition. The menu then shows a
  two-segment toggle, KOLAY | NORMAL / EASY | NORMAL: under PLAY in portrait, beside it in
  landscape. A driving game with its steering switch (`menuOption`) gets both, stacked with the
  difficulty first: under PLAY in portrait, right of PLAY in landscape (see `games/mud-rally`,
  `games/traffic-racer`). A tap on a segment or Left/Right on the keyboard switches it. In Easy a caption says
  "Kolay: sıralamaya girmez" / "Easy: not ranked".
- **Read it.** In `createGame()`, call `isEasy()` (or `difficulty()`, which returns `'easy' | 'normal'`)
  from `@core` and pick your tuning from it. The choice is stored per game
  (`storage` key `difficulty:<gameId>`; `setDifficulty(d)` sets it). Normal is the default.
- **Online.** `difficulty()` is always `'normal'` when `net.active`, and the online menu has no
  toggle, so online code needs nothing.
- **What the core does.** `GHA_END` carries `difficulty` (protocol 2.6), and the result screen shows
  a small EASY tag. Easy runs are practice: the platform keeps them off the leaderboards and gives
  less XP, and the core does not update the local best in Easy.
- **What Easy should change.** Make it genuinely easier, but keep it fun, and leave Normal exactly as
  it was. Keep the Normal and Easy values side by side in one table (see `TUNING` in
  `games/space-blaster`).
  - **AI games:** a weaker AI. Use a lower search depth, more random or noisy moves, or a cap on
    the AI level instead of the full ramp (`EASY_LEVELS` in `games/connect-four` and `games/reversi`,
    `EASY_TOP` in `games/backgammon`).
  - **Action games:** more lives, slower enemies, fewer or slower enemy shots, a slower ramp
    (wave `w` plays like `1 + (w - 1) * ramp`) and more generous pickups or extra lives.
- **Test it.** Expose the tuning on the scene (`tune`, or `ai()` for AI games) so a Playwright check
  can compare Easy with Normal. `scripts/platform-harness.mjs` picks Easy on the menu toggle of
  every game that opts in and checks that `GHA_END` says `'easy'`.

## 7d. Driving games (required for every car game)

Every game where the player drives a car, truck, kart or bike uses the shared car steering in
`src/core/steering/` (exported from `@core`, also for 3D games). Players choose how they steer once,
and the choice carries over to every car game. References: `games/mud-rally` (landscape, gas /
brake / nitro, analogue racing, Easy / Normal), `games/sky-road` (portrait 3D, lateral steering +
JUMP) and `games/traffic-racer` (portrait 2D, lane weaving with BOOST / BRAKE pedals, Easy / Normal).

- **Menu.** `menuOption: steeringOption` in `launch({...})`. On touch screens the menu shows the
  STEERING / KONTROL switch ARROWS | WHEEL | TILT (OKLAR | DİREKSİYON | EĞİM) beside PLAY in
  landscape, under it in portrait; with `difficulty: true` as well, the Easy/Normal switch sits
  above it. Desktops see the usual menu. Choosing TILT asks for the motion
  sensors from inside the tap (iOS); when they are refused or missing, the choice stays as it was.
  The mode is stored once for all driving games (`steerMode()` / `setSteerMode()`, storage key `steer`).
- **The pad.** In `createGame()`:
  ```ts
  this.controls = new Controls(this, {});                  // keys only: no stick on touch
  this.steering = new CarSteering(this, {
    touch: this.controls.touchUi,
    buttons: [                                             // the game's own right-thumb buttons
      { id: 'gas', shape: 'pedal', x: 1180, y: 566, w: 150, h: 220, color: 0x2fae5a, label: t('gas') },
      { id: 'nitro', shape: 'round', x: 1018, y: 448, r: 64, color: 0xff7a1a, icon: 'bolt', count: true, holds: 'gas' },
    ],
    tiltLock: 34,   // degrees of tilt for full lock (default 34; Sky Road uses 26 for quick lane changes)
    ramp: true,     // keys and arrows ease to full lock in RAMP_TIME (0.4 s); a number sets the seconds
    keyRamp: true,  // the keyboard alone (default: as ramp); false = keys answer at once
  });
  ```
  - The left thumb steers in the chosen mode: two arrow buttons, an on-screen wheel turned by
    dragging round its centre (analogue, full lock at `WHEEL_LOCK` 155°, springs back), or the
    phone's tilt (the same wheel follows the phone; a tap on it re-centres; a pulsing TURN TILT ON
    button when iOS needs a tap again). The steering group sits bottom-left (`steer: { x, y }`
    moves it).
  - **Calm steering.** Players found quick steering twitchy, so the defaults are deliberately slow:
    the wheel and tilt share a gentle centre curve (`steerCurve`: steering = input^1.35, so a
    quarter input steers about 0.15), keys and arrows take 0.4 s to full lock (a 0.1 s tap is a
    0.25 nudge) and come back in 0.15 s. A lane game that needs quicker changes may pass a
    shorter `ramp` (Sky Road 0.12 s, Traffic Racer 0.25 s) and a smaller `tiltLock`; tune the
    vehicle's own turn rate (yaw rate, sideways speed) so full lock is not too sharp either.
    Keyboard players may want instant keys in a lane game: `keyRamp: false` (Sky Road, owner
    request) keeps the arrow buttons on `ramp` while the keys answer at once.
  - Right-thumb buttons: `shape: 'pedal' | 'round'`, `color`, `label` (localized in the game),
    `labelY`, `icon: 'bolt' | 'up'`, `count` (a ×n badge, `pad.setCount(id, n)`), `hit` (extra
    touch room; `Infinity` runs a side to the screen edge) and `holds` (another button this one also
    holds). Every finger is read each frame: steer + gas + nitro together, and thumbs may slide
    from one button onto the next. Keep them clear of the pause corner and the HUD; size tap
    targets at least 80 px; check portrait (720×1280) and landscape (1280×720) layouts.
- **Lifecycle.** `steering.begin()` at every race or run start (shows the pad, applies the mode,
  starts or asks for the sensors, falls back to ARROWS with a message when tilt is impossible);
  `steering.update(dt)` every frame in every phase; `steering.centre()` at the start signal (the
  way the phone is held is straight ahead); `steering.end()` on results, shops and game over.
- **Reading it.** `steering.steer(dt, this.controls.axisX)` returns -1..1 (keyboard wins while a key
  is held; arrows ramp like the keys; wheel and tilt are analogue). Buttons: `steering.isDown(id)`
  (held) and `steering.take(id)` (once per finger landing). `steering.pad` is null without touch.
- **Keyboard.** ←/→ (A/D) steer; ↑ (W) gas or the game's main action (jump); ↓ (S) brake or reverse
  when the game has them; Space / Z / Enter for the extra action (nitro, jump). Say so in `howTo`,
  next to "Touch: pick the steering on the menu (arrows, a wheel or tilt)".
- **Strings.** The switch, tilt messages and hints come from the core (`steerTitle`, `steer_*`,
  `tilt*`); only the game's own button labels (GAS / GAZ, BRAKE / FREN, JUMP / ZIPLA...) live in the game.
- **Test** on emulated phones (Playwright `hasTouch: true, isMobile: true`), in the game's
  orientation and with `screen.orientation.angle` 90 for landscape:
  - the switch shows on touch only, and each mode can be picked;
  - WHEEL: a quarter turn clockwise gives about +0.48 (full lock at 155°), release returns to 0;
  - TILT: dispatch `new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta, gamma })`
    repeatedly; right edge down steers right (portrait: gamma > 0; landscape angle 90: beta > 0);
    with `DeviceOrientationEvent.requestPermission` returning `'denied'`, the menu stays on ARROWS;
  - ARROWS give ±1; steering and a right-thumb button work together (multi-touch through CDP
    `Input.dispatchTouchEvent`);
  - screenshots of the menu (TR and EN) and of a race in each mode: nothing overlaps.

## 7e. Ads (optional: rewarded continue and 2× reward)

The platform can show ads (rewarded and interstitial); the owner switches them on in the admin
panel. While they are off (the default) the platform sends `adsEnabled: false` and the core shows
nothing, so a game that opts in looks and plays exactly as before.

- **Only through the core.** `src/core/ads.ts`, exported from `@core`: `adsAvailable()` (the
  platform said `adsEnabled` and this is a solo run; always false standalone, in the portal and
  online), `showRewarded(placement)` (resolves true only when the platform confirms the reward) and
  `showInterstitial(placement)` (always resolves). Never call the adapter's `requestRewarded` /
  `requestInterstitial` yourself. While an ad runs the core pauses the Play scene, silences the
  game (the player's sound switch is not touched), blocks input with a "Reklam yükleniyor… /
  Loading ad…" card and restores everything afterwards.
- **Rewarded is always the player's choice, never during play.** Ads appear on the result screen
  only, as a button the player presses. No ad prompts mid-run, between lives or on the menu.
- **Rewarded continue.** For games with a fail state where going on makes sense (runners,
  shooters with lives, stackers). Opt in with
  `ads: { continue: (play) => (play as PlayScene).revive() }` in `launch({...})`. On a lost run the
  result screen offers DEVAM ET / CONTINUE ("Reklam izle, devam et" / "Watch an ad to continue"),
  once per run. After the ad the core clears `isOver`, resumes physics, music and the scene and
  shows a "DEVAM!" banner; your `revive()` puts the player back: one extra life, moved to safety,
  hazards near them cleared, a short invulnerability (`games/space-blaster`, `games/pixel-runner`,
  `games/jetpack-rush`, `games/tappy-plane`, `games/stack-tower`). Reset everything a death set
  (dead flags, tints, flipped sprites, stopped loops). Optional `canContinue: (play) => boolean`
  skips the offer for runs that cannot go on (a timer ran out).
- **Continues and the score.** The continued run is the same score session: GHA_END waits until
  the player turns the offer down (RETRY, MENU, Enter) or the continued run ends, and then carries
  `continues: 1` (the platform's `finishSession({ continues })`; the vendored adapter 2.7.0 still
  drops the field, a newer adapter forwards it). Easy runs work the same way and
  stay practice.
- **2× reward.** Only for a currency kept between runs (coins, XP), never the score:
  `ads: { double: { grant: (scene, run) => ..., show?: (run) => boolean } }`. The result screen
  offers "2× ÖDÜL / 2× REWARD" once; `grant` adds the run's currency again. On a lost run with a
  continue offer the continue takes the slot.
- **Interstitials** are the core's job: it asks politely at natural breaks (`'menu'` when the
  result screen goes to the menu, `'replay'` on every third RETRY); the platform enforces the real
  frequency caps. Games do not add their own.
- **Test it.** `?ads=sim` (ad watched) or `?ads=sim-skip` (ad not finished) fakes the platform's
  answer after a short delay outside the platform; inside the platform's frame the flag is ignored.
  `node scripts/platform-harness.mjs --dev <slug>` runs a game that opts in a second time with
  `adsEnabled: true` and checks the whole continue flow and the menu interstitial. Keyboard: C
  watches the ad on the result screen.

## 7f. Menu theme (optional: the game's own logo, buttons and frame)

The core menu keeps one layout (logo, best, PLAY, the switches, the game's own row, how-to, the
bottom row with sound, the Ayvago logo and language/leaderboard). A game may give it its own skin
with `menuTheme` in `launch({...})` (`src/core/menu-theme.ts`); the live backdrop (`menuDecor`)
stays. The pause overlay and the result screen follow it (below). Games without one look exactly
as before. Pilot: `games/skull-isle/menu.ts`.

```ts
import { PIRATA_ONE } from '@core/fonts/pirata-one';
menuTheme: {
  font: PIRATA_ONE,                       // display face: logo, labels, headings
  palette: { primary, secondary, board, trim, label, labelStroke, muted, accent, heading, body, icon, shade },
  logo: { fill: ['#fff7c8', '#ffd23f', '#a85a0c'], outline: '#2a1206', rim: '#7a1018', depth: '#5a0e12', size: 150,
          emblem: { draw: skullEmblem, size: 250, overlap: 0.28 } },
  skin: 'plank',                          // or your own SkinPainter
  pieces: [{ kind: 'board', w: 420, h: 104 }],   // the skin pieces your own menu widgets use
  frame: { border: 'rope', notes: (c, w, h) => paintSheet(c, w, h, 31), vignette: 0.6, dim: 0.34 },
},
```

- **Logo.** Rendered from `meta.title` in the current language (never a fixed image, so TR and EN
  both fit): gradient fill, thick outline, optional rim, extruded side, bevel and gloss, a drop
  shadow and the emblem behind. It picks one or two lines, whichever lets the letters be larger
  in the room above the best score, and is drawn at that size. The emblem is the game's own
  canvas painter (`EmblemPainter`: draw into a `size` box), cached with the logo. On menu open the
  logo drops in, a shine sweeps across it (WebGL) and the rest pops in row by row.
- **Skin.** `'plank'` is weathered wood (grain, knots, iron straps and brass rivets on big buttons,
  nails on plates, a gold rim on hover, sunk when pressed). Another look is a `SkinPainter`
  `(ctx, kind, w, h, { color, state, palette, seed })` for the kinds `button | plate | board |
  track | round` and the states `up | over | down | on | off`. Every piece is a canvas texture
  baked once per size and state (`skinTexture`); nothing is redrawn per frame and nothing runs in
  play.
- **Driving games:** the core STEERING switch (`steeringOption`) wears the theme by itself; list
  `...STEERING_PIECES` in `pieces` so its track and knob are painted ahead (Delivery Dash).
- **One place per choice (rule).** Never offer the same choice twice. When the game asks for a class,
  character, vehicle, deck or level after PLAY, the menu shows no switcher for it: the menu is PLAY,
  difficulty, the core options the game needs (steering) and the how-to; "new campaign" and similar
  resets live in an inner screen (Hex Realm 1.1 moved its class row to the class choice and the inn).
- **The game's own menu widgets** (`menuOption.build`) use the same pieces: `SkinButton` (label in
  the display face, `setText`, `fitLabel`, `setLabelY`), `skinImage(scene, x, y, kind, w, h)`,
  `skinIconButton` and `themeText`. Keep tap targets at least as large as the plain menu's.
- **Frame.** `border: 'rope'` (a rope round the screen with brass corner rings) or the game's own
  `BorderStyle` (`{ thick, inset, edge, corner }`: an edge strip and a corner piece painted once and
  mirrored round the screen; Star Squadron's HUD brackets, Snow Express's railway), `notes`: the card
  behind the how-to (`'board'` or the game's painter; the how-to is then drawn in `palette.body`),
  `vignette`: the darkening over the live backdrop, `dim`: a flat darkening under it. A game that
  dims its backdrop itself moves that into `dim` and drops its own full-screen layer.
- **Cost (rule).** Boot paints every theme texture under the Ayvago intro: the logo, the core's
  pieces and the sizes listed in `pieces` (declare every `skinImage` / `SkinButton` size your
  `menuOption` uses). A menu with a live 3D backdrop queues that world's shader compilation as it
  opens; on software-rendered GPUs (old phones, the test machines) anything the menu uploads or
  draws extra then delays the first round. So no TileSprites, masks or extra full-screen layers in
  theme code, only cached canvas textures (the core paints them on software canvases); check the
  round start with `node scripts/platform-harness.mjs <slug>` against `origin/main` a few times.
- **Fonts.** Characterful display faces are welcome, but only SIL OFL ones, bundled locally (copy
  the latin + latin-ext `.woff2` files of the `@fontsource/<face>` package into
  `src/core/fonts/display/` with a CSS file and a small `src/core/fonts/<face>.ts` module, as for
  Pirata One), recorded in `docs/assets/LICENSES.md`, and imported only by the games that use them.
  **The shipped files must cover Turkish** (ç Ç ğ Ğ ı İ ö Ö ş Ş ü Ü): check the woff2 files with
  fontTools (latin + latin-ext together) and render a test string in the game (the advance of each
  letter must be the same with two different fallback fonts). Many display faces ship latin only
  (Rye, IM Fell English SC); pick another face, never fake a glyph. Body text stays in the style's
  body font. `launch()` loads the theme face (both subsets) before the menu opens.
- **Pause and result screens** wear the theme automatically (`src/core/overlay-theme.ts`): the
  vignette and rope over the frozen round, the notes card (else the skin's board) with the logo's
  emblem on its top edge (portrait), headings and button labels in the display face, the skin's
  buttons for RESUME / RETRY / MENU / sound and the rewarded CONTINUE / 2× (a green plank with a
  brass AD tag), the score counting up in painted digits, the best line in ink and NEW BEST on a
  ribbon in the primary colour with a burst. Same buttons, keys, ad flow and test hit points as the
  plain screens; online results stay plain. The pause is fully drawn on its first frame (the
  entrance only moves and scales it) and resume never waits. Overrides in `menuTheme.overlays`:
  `card` ('notes' | 'board' | painter), `dim`, `vignette`, `emblem` (painter or null), `border`,
  `ink`, `lose` / `win` (heading colours), `adColor`, and `titles`: the i18n keys of the headings
  the game passes to `endGame({ title })`, so they are painted ahead too. `overlays: false` keeps
  the plain screens.
- **The game's own panels** in the same look: `themeCard(scene, x, y, w, h)` (declare the size in
  `menuTheme.cards`), `themeLabel(scene, x, y, text, style)` (a label painted once and cached by
  text and style; `overlayHeadingStyle(win)` is the result heading's style, so a declared title is
  reused) and `ThemeNumber` (a number from painted digits that can count every frame). Skull Isle's
  run summary (`PlayScene.showSummary`) is the example.
- **Inner screens** (a shop, a talent board, a setup page; references: Star Squadron's
  `talentsui.ts`, Zombie Grove's `camp.ts` and `chestui.ts`, Kickflip Park's `setup.ts`):
  - `menuTheme.prebake(scene)` paints the game's own pieces in Boot under the intro, after the
    core's: `skinTexture` for each size, colour and state, `labelTexture` for every fixed label
    (titles, tab and button labels, item names) in the current language, `bake(scene, key, w, h,
    draw)` for anything else (a backdrop, a halo, a padlock), and `new ThemeNumber(scene, 0, 0, 0,
    style).destroy()` for the digits of prices and purses. `pieces` also take `color` (any face
    colour: a tile per state, a red RESET) and `states` (e.g. `['up', 'on']` for a tile with a
    focus glow, `'off'` for a disabled button).
  - `SkinButton` for every button: `setEnabled(false)` shows the skin's `'off'` face and sends taps
    to `onDenied` (shake it, say why); `setColor(c)` swaps the face colour (a selected tab, an
    armed RESET); `setSub(text)` adds a small second line in the body font (a price, what START
    skates); `setHighlight(on)` shows the hover face for the keyboard's focus; `sfx: ''` when the
    action plays its own sound. Tiles are `skinImage` faces whose texture is swapped by state
    (`skinTexture(..., on ? 'on' : 'up', colour)`); labels that change swap prebaked textures with
    `placeLabel(img, labelTexture(...))`.
  - `themeCard` for the page's panel (declare the size in `cards`) and `frameBorder(scene)` for
    the frame round a scene of its own. Only text that really changes (descriptions, a count up)
    stays a live Text. Check with the texture manager: opening the screen adds no keys besides
    those Texts (`game.textures.getTextureKeys()` before and after).
  - **Panels** (`src/core/theme-panels.ts`; references: Skull Isle's `shop.ts` and `board.ts`, Snow
    Express's and Delivery Dash's `mapui.ts`, Rooftop Courier's and Coaster Rush's `shop.ts`): a
    screen with no live Text at all. Each piece has a prebake companion that paints the same keys:
    - `labelAt(scene, x, y, text, style, ax)`: a painted label anchored at its letters' left edge
      (`ax` 0), centre (0.5, as `themeLabel`) or right edge (1); `fitWidth(obj, room)` shrinks it
      to a width (long Turkish words). Prebake: `labelTexture(scene, text, style)`.
    - `GlyphText(scene, x, y, text, style, align)`: a line that changes (a purse, a price, a
      ratio) set from a glyph atlas (`NUMERIC_GLYPHS` by default: digits, `/ . , : % + - × →`,
      `$ ₺ ★`); `setText` only swaps frames. Prebake: `glyphAtlas(scene, style, chars?)`.
    - `FmtLine(scene, x, y, style, align).set(key, { n })`: a translated line with values ("{n}
      more stamps", "{a} → {b}"), the words painted labels, the values glyphs. Prebake:
      `bakeFmt(scene, key, ['n'], style)`.
    - `Para(scene, x, y, text, style, maxW, align, lineH)`: a paragraph wrapped into painted lines
      (`wrapLines` gives the lines). Prebake: `bakePara(scene, text, style, maxW)`.
    - `KitButton(scene, x, y, { w, h, kind, color, label, style, sfx, on, tapWhenOff }, onTap)`: a
      skin button with a painted label fitted to its face; `setLook(color, on)` / `setSelected`
      for a tab or tile (the skin's `'on'` face), `setEnabled(false)` for the `'off'` face
      (`tapWhenOff` still calls back to say why), `setLabel`, `setHit` for a larger tap area,
      `addContent(icon, glyphText)` for content that drops with the label when pressed; its tap
      does not fall through to objects under it. Prebake: `bakeButton(scene, kind, w, h, color,
      off?, on?)`. `SkinButton` stays the one for menu rows (`menuOption`) and live labels.
    ```ts
    const PRICE: LabelStyle = { size: 24, color: '#fff6e6', stroke: INK, strokeWidth: 4 };
    export function prebakeShop(scene: Phaser.Scene): void {        // from menuTheme.prebake
      labelTexture(scene, t('shopTitle'), TITLE);
      glyphAtlas(scene, PRICE);
      bakeFmt(scene, 'shopNeed', ['n'], NEED);
      bakeButton(scene, 'button', 128, 46, GREEN, true);
    }
    // on open: only images placed
    this.add(fitWidth(labelAt(this, width / 2, 70, t('shopTitle'), TITLE), 430));
    const buy = new KitButton(this, x, y, { w: 128, h: 46, color: GREEN, sfx: null }, () => this.buy(id));
    buy.addContent(new GlyphText(this, 14, 0, String(price), PRICE)).setEnabled(price <= purse);
    this.add(new FmtLine(this, x, y - 60, NEED).set('shopNeed', { n: price - purse }));
    ```
- **Cost (overlays).** Boot paints every texture of these screens in the current language
  (`prebakeOverlays`); opening the pause or the result creates no texture and rasterises no text
  (only a language switch mid-session paints the new labels on first use). Check the platform
  harness's pause step against `origin/main` (`node scripts/platform-harness.mjs <slug>`).
- **Store art.** `scripts/gen-store-assets.mjs` takes the themed logo (English) from the game
  itself (`window.__ayvago.menuLogo('en')`, and `'tr'` for the Turkish card) and puts it on the
  catalog cards and the cover in place of the plain title, and writes it in both languages as the game's logos (`logo-en.png`,
  `logo-tr.png`). Look at all of them after `node scripts/gen-store-assets.mjs <slug>`.
- **Check** EN at 720×1280 and TR at 405×720 (menu, pause, a lost and a NEW BEST result, the
  result with `?ads=sim` and a test `ads` option), the logo's entrance, hover and pressed states,
  and that the Turkish letters come from the display face.

## 7g. Action combat and progression (melee, action RPG, roguelite)

Reference: `games/hex-realm` (1.2): `defs.ts` (combo data), `battle.ts` (sim), `powers.ts`
(Shrine ranks, power cards), `weapons.ts` (weapon kinds and models), `screens.ts` (Shrine, Combos,
Cards, draft), `bot.ts` / `balance.ts`.

- **Three distinct combos per character (rule)** for any game where the hero swings, shoots or
  punches. They differ in input, rhythm, reach, hit shape and finisher, not in colour:
  - A: tap, tap, tap: a quick chain ending in a finisher (a spin all round);
  - B: tap, tap, then hold ATTACK (~0.35 s): a charged finisher (a cleave with a shockwave lane)
    that breaks shields, with armour (less damage, no flinch) while it charges and a bigger hit-stop;
  - C: ATTACK right after a dodge: a lunge, a launcher that throws light foes up, a leap with a
    ring on landing.
  Every class or weapon gets its own idiom of the three (bow: triple shot, power shot, arrow rain;
  staff: bolt fan, lance, meteor). Build them from the model's own clips, varied by speed, lunge,
  body spin, a held slow wind-up and a leap arc; never extra limbs.
- **The sim owns the combo.** Input carries presses and `held` (the button still down); the
  simulation decides the chain, step, buffering, the charge and every hitbox; the view only draws.
  Holding ATTACK carries the chain on (no auto-repeat in the scene), so touch players get the heavy
  chain by holding and the quick one by tapping.
- **Combos only in combat (rule).** The sim decides "in combat" (a hostile foe within engage range,
  ~6.5 m for melee or the class's aim for ranged, a foe winding up, a boss up, or a blow dealt or
  taken in the last ~2.5 s). Out of combat ATTACK is one clean single swing with a short recovery
  (crates, exploring); a chain goes on seamlessly when a foe comes close mid-swing. A soft target
  assist turns the blow to the best foe ahead (no hard lock) and the view rings that foe.
- **Show and teach them, without clutter.** Nothing floats over the hero's head (no combo pips or
  charge rings there): the heavy charge fills a ring on the touch ATTACK button and on the ground
  under the hero, with a glow on the weapon hand; a landed finisher's name pops small at the impact
  (only when it hits); each finisher has its own impact (hit-stop, shake, sound, FX). A short
  skippable tutorial step with all three inputs (touch and keys), a first-time hint for each combo
  not used yet, and a themed "Combos" list in an inner screen that says combos chain in combat.
- **Weapons you can see.** When gear has weapons, the equipped one is the model in the hero's hand
  (hide a welded weapon by shrinking its bone; one `BatchedMesh` for every weapon in sight keeps it
  to one draw call), its icon is the model (pre-rendered offline, loaded as images), drops show the
  model in a beam of the rarity's colour, and its kind changes the feel (light, balanced, heavy,
  reach) by a few numbers shown on the item card.
- **Two kinds of progression (rule)** for action RPGs and roguelites:
  - a persistent upgrade path whose ranks change behaviour, not only numbers (rank I more power;
    II and III: pulls foes in, leaves a burning line, stuns, splits, pierces, strikes twice), for
    every skill and finisher, paid with gold and a rare currency from bosses, camps and elites;
  - a per-run power-card draft: pick 1 of 3 (common, rare, epic, legendary; one reroll) after
    won chapters, camps and some level-ups, lasting the run or session, 20+ cards over offence,
    defence, combos, skills, economy and a few per class, listed in an inner screen and under the
    pause (add objects to the core Pause scene on its CREATE), with a compact HUD chip.
- **Theme and cost.** Every new screen (upgrades, draft, card list, combos) uses the menu theme's
  panels and is prebaked under the intro (card faces per rarity with `bake`, every name and line
  with `labelTexture` / `bakePara`); opening one adds no texture besides live Text (check
  `game.textures.getTextureKeys()` before and after).
- **Balance with bots.** The autopilot plays the combos (taps, holds against shields and bosses,
  rolls in for the dash strike), buys ranks and picks cards; rerun the headless balance and retune
  foe health / damage curves so the pacing targets still hold with the new power.

## 7h. Gamepad (automatic)

Every game plays with a standard gamepad (Xbox, PlayStation, Switch Pro in the browser's
"standard" mapping) with no code of its own. `launch()` starts `src/core/gamepad.ts`, which polls
the pad once per frame (only while one is connected) and dispatches real `keydown` / `keyup`
events with `key`, `code`, `keyCode` and `which` set, on the focused element, so they reach
Phaser (`addKey`, `createCursorKeys`, `keydown-X`, `JustDown`, `Controls`) and DOM listeners on
`window` and `document` like real keys. So a game that is fully playable on the keyboard is
playable on a pad: give every action a key from the table below where it fits.

| Pad (standard index) | In play | On screens (menu, result, a game's `pushModal` overlay) | Pause |
|---|---|---|---|
| D-pad (12–15), left stick | arrows | arrows | arrows (pick a button) |
| A / Cross (0) | Space | Enter | Enter (presses the focused button, RESUME first) |
| B / Circle (1) | X (second action, core `Controls` B) | Escape (back; MENU on the result screen) | Escape (resume) |
| X / Square (2) | J | J | J |
| Y / Triangle (3) | K | K | K |
| LB (4) / RB (5) | Q / E | Q / E | Q / E |
| LT (6) / RT (7) | L / Z | L / Z | L / Z |
| Back / Select (8) | M | M | M |
| Start (9) | Escape (pauses) | Enter | Escape (resumes) |
| L3 (10) / R3 (11) | C / B | C / B | C / B |

- The stick presses an arrow beyond 0.35 and lets go under 0.25, in eight sectors (a diagonal
  presses two arrows); a held direction repeats like a keyboard key (after 500 ms, every 100 ms).
- Start sends Escape, not P, so the typing games (`pauseOnP = false`) still pause.
- The pad's keys are its own: a key held on the keyboard and the pad goes up when both let go.
  Everything is released when the pad disconnects, the page is hidden, the window loses focus or
  an ad plays; a control still held then waits until it comes up.
- **Own mapping.** `gamepad: { b: 'Escape', rt: 'ArrowUp', back: null }` in the game definition
  maps a control to another key (`KeyboardEvent.code`) or turns it off (null), during play only;
  screens keep the core mapping.
- **Analog.** `padAxes()` gives `{ lx, ly, rx, ry, lt, rt }` (radial deadzone, -1..1 and 0..1),
  `padConnected()` whether a pad is there, `padRumble(ms, strength)` a rumble where the browser
  has one, `inputMode()` / `onInputMode(cb)` 'gamepad' | 'keyboard' | 'touch' (for pad glyphs
  later). The core pause screen shows a focus ring on its buttons while the input mode is 'gamepad' (after the first arrow on a keyboard).
- **Test.** `npm run test:gamepad` (`scripts/gamepad-unit.ts`, then `scripts/gamepad-test.mjs`
  against `dist/`; `--dev`, `--canary`, `--serial`, `--shots <dir>`, slugs) plays each game with a
  fake pad only: A through the intro, menu and pre-run screens, 2 s of stick and D-pad, every
  button, Start to pause and resume, B from the result screen to the menu, and no key stuck after
  unplugging.
- Do not list `gamepad` in `game.json` `controls` until the game passes that test and plays well
  with the pad.

## 7i. Game guide (required)

Every game page on ayvago.com shows a written guide beside the game frame: what the game is, how
to play, the controls, tips, features and an FAQ. The frame is a cross-origin iframe that search
engines and ad reviewers do not count as content, so the guide is the page's own text; it is also
what a player reads before pressing Play. It is part of the Definition of Done for every new game.

- **Source:** `games/<slug>/guide.json`, a `GameGuide` (`scripts/vendor/guide.ts`, vendored
  verbatim from the platform's `packages/shared/src/guide.ts`: the contract, never edited here).
  Every text is a `{ "en": "...", "tr": "..." }` map; always write both.

  ```json
  {
    "about": { "en": "Paragraph.\n\nParagraph.", "tr": "Paragraf.\n\nParagraf." },
    "howToPlay": [{ "en": "Step.", "tr": "Adım." }],
    "controls": { "keyboard": { "en": "...", "tr": "..." }, "touch": {}, "mouse": {}, "gamepad": {} },
    "tips": [{ "en": "...", "tr": "..." }],
    "features": [{ "en": "...", "tr": "..." }],
    "faq": [{ "q": { "en": "...?", "tr": "...?" }, "a": { "en": "...", "tr": "..." } }]
  }
  ```

  `controls` lists only the inputs the game has (at least one); `features` and `faq` are optional
  in the schema but expected from the studio.
- **Scaffold:** `npm run new-game` copies a stub full of `TODO`s. A guide with a TODO left is a
  draft: `npm run platform` leaves it out of the catalog and `validate:platform` lists it.
- **Generated:** `npm run platform` writes every finished guide into `platform/arcade-guides.json`
  (`{ "version": 1, "guides": { "<slug>": … } }`, sorted, schema key order). The platform's catalog
  sync pulls it from `main` with `arcade-catalog.ts` and renders it server-side; CI fails when it
  is stale, like the catalog.
- **Checked:** `npm run validate:platform` parses the file with the schema and fails on: a slug
  that is not a shipped game; a text without its Turkish or with the Turkish identical to the
  English; `about` not in 2–3 paragraphs; under 200 words in a language; Turkish without a single
  ç ğ ı İ ö ş ü; a `controls` input the game's manifest `input` does not declare (game.json
  `controls`, plus mouse). It warns outside the ranges below and prints the word counts.

**Writing rules**

- **Accurate.** Read the game's code (`*.ts`, `game.json`, its strings) and write only what the
  game really does: its modes, Easy/Normal where offered, real keys and gestures, scoring,
  power-ups, characters, online play and rules. Every number (lives, laps, board size, prizes)
  matches the code. Never invent a feature.
- **Original and useful.** Written for someone about to play: what the game is and what makes it
  different, how a round flows, concrete tips a good player would give, and the questions people
  really ask ("Can I play with a friend?", "Is there an easy mode?", "Does it work on phones?",
  "How are points scored?"). No filler, no keyword stuffing, no superlatives, no mention of search
  engines or ads, and no template sentence reused from another game's guide.
- **Natural Turkish.** Written as Turkish, not translated word by word, with correct ç ğ ı İ ö ş ü,
  the game's Turkish title and its in-game Turkish terms (button labels, item and mode names);
  traditional games use their real Turkish names (okey: gösterge, seri, per, çift, sahte okey).
- **Controls.** Keyboard, touch and mouse as the code supports them. Add `gamepad` only when the
  pad really plays the whole game with the core mapping (§7h) and the game lists `gamepad` in
  `game.json` `controls` (after `npm run test:gamepad` passes); then say which buttons do what.
- **Lengths.** `about` 120–200 words in 2–3 paragraphs (blank line between them); `howToPlay`
  3–6 steps; `tips` 3–6; `features` 3–6 short items; `faq` 3–4; about 300–600 words per language
  in all.

## 8. Ship

- Run `npm run registry` (validates `game.json`).
- Run `npm run build`.
- Write `games/<slug>/guide.json` (§7i), then run `npm run platform` (writes `public/games/<slug>/ayvago.json`, the platform catalog and `platform/arcade-guides.json`).
- Run `node scripts/gen-store-assets.mjs <slug>` (platform cover, icon, screenshot, catalog card in two sizes and two languages, the logos and portal thumbnail), then `npm run validate:platform`.
- Look at the logos `public/games/<slug>/ayvago/logo-en.png` and `logo-tr.png` (manifest `assets.logo`): the title art on a transparent background, which ayvago.com draws over a screenshot on the game page. A game with a menu theme gets its themed logo (emblem included), any other the card's plain title logo; the Turkish letters must be right. `--logo-only` redoes just them.
- Look at the catalog cards `public/games/<slug>/ayvago/card-640x360.webp` and `card-tr-640x360.webp` (the same frame, the Turkish logo shrunk to fit at most two lines): they are what players see first in the ayvago.com catalog. They must show real play (not the menu, a round-start banner or an empty or black frame) and the logo must not hide the action. If it misses, add the game to the `CARD` table in `scripts/gen-store-assets.mjs` (`pick` another candidate frame, `wait` before the scripted play, or `accent` for the logo colour); `CARD_FRAMES=<dir>` keeps the candidate frames for a look and `--card-only --from-frames` re-composes from them without replaying.
- Run `node scripts/platform-harness.mjs <slug>` (GHA_* protocol check, embedded like ayvago.com).
- Commit `games/<slug>`, `public/games/<slug>/`, `public/thumbs/<slug>.png`, `platform/arcade-catalog.ts` and `platform/arcade-guides.json`. The platform pulls the catalog from `main` by itself (its "Sync arcade catalog" workflow opens the PR); never copy it by hand.
