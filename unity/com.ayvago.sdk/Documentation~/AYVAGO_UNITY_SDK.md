# Ayvago Unity SDK: building Unity (WebGL) games for ayvago.com

This document is the contract for a Unity game on the Ayvago platform. It covers:
- the platform protocol;
- the Unity package that bridges C# and the page;
- the leaderboard rules;
- the house rules every Ayvago game follows (the same rules as the studio's Phaser games);
- how a build gets into the studio and is tested.

Give it to whoever builds the game, human or AI, together with the game's concept.

Status: version 2 of the Unity contract (platform protocol 2.8, adapter 2.8.0, package
`com.ayvago.sdk` 0.1.0). The package (§4) replaces the copy-paste reference code of version 1.
The same file ships in the package as `Documentation~/AYVAGO_UNITY_SDK.md`; `npm run check:unity`
keeps the two identical.

---

## 1. How a Unity game reaches players

```
Unity project (its own repo)  ──Ayvago → Build WebGL…──▶  studio repo selchook/ayvago-games
  + com.ayvago.sdk (git URL)                               public/games/<slug>/  (index.html, Build/, TemplateData/)
                                                           games/<slug>/         (game.json "engine": "unity", guide.json)
                                                                  │  gen-registry, gen-platform, store-assets, tests
                                                                  ▼
                                          Vercel: https://ayvago-games-nine.vercel.app/games/<slug>/
                                                                  │  catalog sync (platform repo)
                                                                  ▼
                                          ayvago.com game page: the build runs in a sandboxed iframe
```

- **Two repos.** The Unity project lives in its own repository (Unity projects are large). Only
  the WebGL build output comes into the studio repo, plus the game's metadata and art.
- **Where the build goes.** `public/games/<slug>/` holds `index.html`, `Build/` and
  `TemplateData/`. Next to them are the generated `ayvago.json` manifest and the `ayvago/` store
  art. Vite copies `public/` into `dist/` unchanged, so Vercel serves the build at
  `/games/<slug>/` with no build step of its own.
- **The iframe.** ayvago.com embeds the game's URL with
  `sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-forms"` and
  `allow="autoplay; fullscreen; gamepad; accelerometer; gyroscope"`. The game is cross-origin to
  the page. It never calls Firebase or any Ayvago server: everything goes through `postMessage`
  (the GHA protocol, §3).
- **Not cross-origin isolated.** The page is not cross-origin isolated (no COOP/COEP), so
  `SharedArrayBuffer` is unavailable. Build with **WebGL threads off**.
- **Platform id.** The slug without hyphens (`moon-rover` → `moonrover`, `[a-z0-9]{3,32}`).

---

## 2. Build settings (Unity 2022.3 LTS or Unity 6, WebGL)

**Ayvago → Apply Player Settings** sets all of these except the render pipeline, texture
compression and (Unity 6) code optimization, which are project and build-profile choices.

| Setting | Value | Why |
|---|---|---|
| Target | WebGL | |
| WebGL Template | `Ayvago` (§4.3) | loads the adapter, bridges events, shows the loader |
| Compression Format | **Disabled** | Vercel compresses on the fly; pre-compressed `.br`/`.gz` files need special headers |
| Decompression Fallback | off | |
| Data Caching | on | IndexedDB cache; works in the sandbox (`allow-same-origin`) |
| Threads / multithreading | **off** | no `SharedArrayBuffer` in the iframe |
| Code optimization | Disk size with LTO (Unity 6) / Master + stripping High (2022) | download size |
| Exceptions | Explicitly thrown only | size and speed |
| Color space | Linear (WebGL 2) | |
| Graphics API | WebGL 2 only | |
| Render pipeline | URP, mobile-friendly settings | phones play too |
| Run in background | **off** | the platform and the tab pause the game |
| Texture compression | ASTC for the phone build or "both" (DXT + ASTC) | memory on phones |

**Budgets** (the Phaser games are a few MB, so players notice):
- **First download:** under 25 MB compressed. Aim for 10–15 MB.
- **Load time:** playable within 10 s on a mid-range phone on 4G.
- **Memory:** heap 256–512 MB max.
- **Frame rate:** 60 fps on desktop, 30+ fps on a mid-range phone.
- **Avoid:** runtime network loads (Addressables from a remote server are not allowed).
  Everything ships inside the build.

---

## 3. The platform protocol (GHA, protocol 2.8)

The page and the game exchange `window.postMessage` objects `{ type: 'GHA_…', ...payload }`.
The official implementation is the adapter, `src/core/ayvago/adapter.ts` in the studio repo,
vendored from `packages/platform-adapter` in the platform repo. **Never re-implement the
protocol in C#.** Bundle the adapter into the WebGL template as plain JS (§4.1) and call it
through the bridge.

**Handshake.**
1. The game posts `GHA_READY { gameId, adapter }` to the parent. Only these parent origins
   count: `https://ayvago.com`, `https://www.ayvago.com`, `https://ayvago-*.vercel.app`,
   `http://localhost:3000`.
2. The platform answers `GHA_START { config }` within 3 s.
3. With no answer, the game is *standalone*: same API, no-ops, browser language.

**Game → platform**

| Message | When | Payload |
|---|---|---|
| `GHA_LOADING` | while the build downloads and starts | `progress` 0..1 |
| `GHA_SESSION_START` | each round starts (PLAY, RETRY) | none |
| `GHA_GAMEPLAY_STOP` | a round is left without an end (MENU from pause) | none |
| `GHA_SCORE` | optional mid-run checkpoint | `score` |
| `GHA_END` | **once** per round, on the result screen | `score`, `won`, `difficulty?: 'easy'\|'normal'`, `continues?: 1` |
| `GHA_HAPPY_TIME` | a new personal best (with GHA_END) | none |
| `GHA_AD_REQUEST` | the player pressed a rewarded button, or a natural break | `id`, `format: 'rewarded'\|'interstitial'`, `placement` |
| `GHA_MUTE_STATE` | after the handshake and on every change of the game's sound switch | `muted` |
| `GHA_OPEN_LEADERBOARD` | the menu's trophy button (embedded only) | none |

**Platform → game**

| Message | Meaning |
|---|---|
| `GHA_START { config }` | the handshake (see config below) |
| `GHA_PAUSE` / `GHA_RESUME` | open the pause overlay / the platform's overlay closed (the player resumes from the pause overlay) |
| `GHA_MUTE { muted }` | the platform's sound button: set the one sound switch |
| `GHA_THEME_CHANGE { theme, colorMode, tokens }` | platform theme changed (`minimal`, `cartoon`, `arcade`, `retro`) |
| `GHA_LOCALE_CHANGE { locale }` | language changed: re-render every text |
| `GHA_AD_RESULT { id, rewarded, shown }` | answer to an ad request (the adapter times out after 90 s as "not rewarded") |

`config` in GHA_START:

| Field | Use |
|---|---|
| `locale` | `"en"` or `"tr"`. The game's language. |
| `adsEnabled` | false: show no ad buttons at all. |
| `best` | number: the player's record on ayvago.com, which **replaces** the locally stored best. `null`: no score yet. Absent: keep the local best. |
| `character` | the player's chosen character: one of `adventurer`, `explorer`, `rookie`, `soldier`, `zombie` (absent → the game's default). |
| `theme`, `colorMode`, `tokens` | platform theme. Under `retro` and `arcade` the page draws CRT scanlines itself, so the game hides its own scanlines. |
| `mode`, `isHost`, `playerIndex`, `playerCount`, `peerName`, `seats`, `table` | online play. Solo games ignore them. |

---

## 4. The Ayvago Unity package (`com.ayvago.sdk`)

The package lives in the studio repo at `unity/com.ayvago.sdk`. Every game installs it with
Package Manager → **+** → **Add package from git URL…**:

```
https://github.com/selchook/ayvago-games.git?path=/unity/com.ayvago.sdk
```

Append `#<commit>` to pin a version.

| Part | What it is |
|---|---|
| `Runtime/AyvagoSDK.cs` | the bridge: config, platform events, platform calls, ads that hold the game; creates itself before the first scene |
| `Runtime/AyvagoRun.cs` | one round by the leaderboard rules (§6) |
| `Runtime/AyvagoAudio.cs` | the one sound switch |
| `Runtime/AyvagoStrings.cs` | TR/EN string table, with the studio's core strings |
| `Runtime/AyvagoDevice.cs` | phone, touch and orientation |
| `Runtime/AyvagoDifficulty.cs` | EASY / NORMAL |
| `Runtime/AyvagoTestHooks.cs` | the test hooks (§8) |
| `Runtime/UI/` | `AyvagoKeyHelp` (key caps), `AyvagoHudChip` (HUD chips), generated sprites, an optional TextMeshPro hook |
| `Runtime/Intro/AyvagoBootIntro.cs`, `Runtime/Resources/AyvagoBoot/` | the brand intro and its five sprites |
| `Runtime/Plugins/WebGL/Ayvago.jslib` | the C# → page functions |
| `WebGLTemplates~/Ayvago/` | the WebGL template: `index.html`, `TemplateData/style.css`, `TemplateData/ayvago-bridge.js`, `TemplateData/ayvago-adapter.js` |
| `Editor/` | the **Ayvago** menu |
| `Fonts/` | Fredoka, Nunito, Press Start 2P, Pixelify Sans, Ayvago Pixel TR as TTF; `OFL.txt`; `turkish-charset.txt` |
| `Documentation~/` | this contract, and the Claude Code files (`claude/CLAUDE.md`, `claude/skills/ayvago-unity-game/SKILL.md`) |

### 4.1 The adapter as plain JS

The protocol is never re-implemented in C#. The template carries the official adapter
(`src/core/ayvago/adapter.ts`, vendored from the platform) bundled as plain JS:

```bash
npm run build:unity-adapter        # node scripts/build-unity-adapter.mjs
# esbuild --bundle --format=iife --global-name=AyvagoAdapter --target=es2017
# → unity/com.ayvago.sdk/WebGLTemplates~/Ayvago/TemplateData/ayvago-adapter.js
```

`node scripts/build-unity-adapter.mjs --check` fails when the committed bundle is stale (CI runs
it). `window.AyvagoAdapter.createPlatformAdapter({ gameId })` returns a Promise of the adapter
(the `PlatformAdapter` interface of `adapter.ts`).

### 4.2 `Runtime/Plugins/WebGL/Ayvago.jslib`

Three functions pass strings to `window.AyvagoBridge` in the page:
- `AyvagoConfigJson()`: the page's config, read into `AyvagoConfig`;
- `AyvagoCall(method, json)`: a platform call;
- `AyvagoPublishState(json)`: the test-hook state.

### 4.3 The WebGL template (`WebGLTemplates~/Ayvago`)

**Ayvago → Install WebGL Template** copies it into `Assets/WebGLTemplates/Ayvago`.

- **`index.html`**:
  - a full-frame canvas;
  - a dark loader with the game's name and a progress bar;
  - no Unity footer, logo or fullscreen button: the platform has its own;
  - the game id comes from the template variable `AYVAGO_GAME_ID`, which the build menu sets to
    the slug without hyphens.
- **`TemplateData/ayvago-bridge.js`**:
  - creates the adapter at page load, so GHA_READY goes out while Unity downloads;
  - reports the download as GHA_LOADING once the handshake is done;
  - loads the build, then passes messages both ways;
  - holds calls from C# until the handshake has finished.

Page → Unity (`SendMessage('AyvagoSDK', method, json)`):

| Method | When |
|---|---|
| `OnPlatformConfig` | the handshake finished (embedded or standalone): the full config |
| `OnPlatformPause` `{reason}` | GHA_PAUSE (`platform`) or the tab was hidden (`hidden`) |
| `OnPlatformResume` | GHA_RESUME |
| `OnPlatformMute` `{muted}` | GHA_MUTE |
| `OnPlatformLocale` `{locale}` | GHA_LOCALE_CHANGE |
| `OnPlatformTheme` `{theme, colorMode}` | GHA_THEME_CHANGE |
| `OnAdResult` `{id, rewarded}` | the answer to an ad request (the adapter gives up after 90 s: not rewarded) |
| `OnTestCommand` `{name, arg}` | a test command (§8) |

Unity → page (`AyvagoCall`): `sessionStart`, `gameplayStop`, `score`, `end`, `celebrate`,
`mute`, `leaderboard`, `rewarded`, `interstitial`.

The config (`AyvagoConfig`):

| Field | Meaning |
|---|---|
| `handshake` | the handshake has finished |
| `embedded` | GHA_START was answered |
| `locale` | `?lang=`, else the platform locale, else the browser language; `en` or `tr` |
| `langForced` | `?lang=` was given |
| `adsEnabled` | ads allowed |
| `hasBest`, `best` | the platform's best: `hasBest && best >= 0` a number, `hasBest && best < 0` null (no score yet), `!hasBest` unknown |
| `character` | the player's character id |
| `theme`, `colorMode` | the platform theme |
| `touch`, `phone` | the device rule (§5.2) |
| `orient` | `?orient=` |
| `nointro`, `keyhelp` | `?nointro`, `?keyhelp` |
| `webdriver` | `navigator.webdriver`: an automated browser |
| `gameId` | the platform id |

### 4.4 The C# API

| | |
|---|---|
| `AyvagoSDK.Config`, `.Ready`, `.Embedded`, `.WhenReady(action)`, `.ConfigReady` | the config; the handshake has finished |
| `AyvagoSDK.Paused`, `.Resumed`, `.MuteChanged`, `.LocaleChanged`, `.ThemeChanged` | platform events |
| `AyvagoSDK.Rewarded(placement, done)`, `.Interstitial(placement, done)`, `.AdsAvailable`, `.AdShowing` | ads. While an ad runs the game is held: `Time.timeScale = 0` and `AudioListener.pause`, both restored afterwards |
| `AyvagoSDK.OpenLeaderboard()`, `.Character`, `.HostScanlines` | the trophy button; the player's character; hide the game's scanlines |
| `AyvagoSDK.SessionStart()`, `.GameplayStop()`, `.SubmitScore()`, `.EndGame()`, `.Celebrate()`, `.ReportMute()` | the raw calls: use `AyvagoRun` and `AyvagoAudio` instead |
| `AyvagoRun.Begin()`, `.End(score, won)`, `.Abandon()`, `.Continue(done)`, `.CanContinue`, `.Checkpoint(score)`, `.Best`, `.HasBest`, `.Order`, `.MinDurationMs`, `.OffersContinue` | one round (§6) |
| `AyvagoAudio.Muted`, `.SetMuted()`, `.Toggle()`, `.Changed`, `.Volume` | the one sound switch: it drives `AudioListener.volume`, reports GHA_MUTE_STATE after the handshake and on every change of the game's own, and never echoes a platform change |
| `AyvagoStrings.Register(key, en, tr)`, `.T(key, vars)`, `.Lang`, `.SetLang()`, `.LocaleChanged`, `.Upper()` | text (`Upper` maps i → İ in Turkish) |
| `AyvagoDevice.Decide(setting)`, `.Current`, `.IsLandscape`, `.IsPhone`, `.Touch`, `.Configure(canvasScaler)` | orientation, decided once |
| `AyvagoDifficulty.Offered`, `.Current`, `.IsEasy`, `.Changed` | difficulty |
| `AyvagoKeyHelp.SetRows(...)`, `.InMenu()`, `.ShowFirstPlay()`, `.PauseStrip()` | key help (§5.6) |
| `AyvagoHudChip.Create(...)`, `.SetText()`, `.SetCaption()`, `.SetIcon()` | HUD chips (§5.4) |
| `AyvagoUI.Retro`, `.BodyFont`, `.TitleFont`, `.CreateText` | the style and fonts of the package UI (TextMeshPro through `CreateText`) |
| `AyvagoTestHooks.Publish(screen, score, level)`, `.Command`, `.ContinueOffered` | test hooks (§8) |

In the Editor and in non-WebGL players every call is logged and nothing else happens, as in a
standalone run. `AyvagoSDK.EditorConfig` simulates a platform config.

### 4.5 Setting up a game

1. Install the package (git URL above).
2. **Ayvago → Set Up Claude Code Files** (when Claude Code builds the game). It writes:
   - `CLAUDE.md` in the project root, or `CLAUDE.ayvago.md` when the project already has one;
   - `.claude/skills/ayvago-unity-game/SKILL.md`, with a copy of this contract next to it.
3. **Ayvago → Install WebGL Template**, then **Ayvago → Apply Player Settings** (§2).
4. A `Boot` scene with the `AyvagoBootIntro` component, first in Build Settings. The game's first
   scene comes right after it.
5. TextMeshPro font assets from `Fonts/` into `Assets/` (the package README has the steps).
6. **Ayvago → Build WebGL…** into the studio checkout (§7).

### 4.6 The shape of a game

```csharp
using Ayvago;

AyvagoDevice.Decide(OrientationSetting.Adaptive);
AyvagoRun.Order = ScoreOrder.Desc;              // = game.json platform.scoring.order
AyvagoRun.MinDurationMs = 3000;                 // = game.json platform.scoring.minDurationMs
AyvagoRun.OffersContinue = true;                // the result screen offers the rewarded continue
AyvagoDifficulty.Offered = true;

void Play()   { AyvagoRun.Begin(); Show(AyvagoScreen.Play); }
void Lost()   { if (AyvagoRun.CanContinue) ShowContinueOffer(); else ShowResult(AyvagoRun.End(score, false)); }
void OnContinue() { AyvagoRun.Continue(ok => { if (ok) ResumeRound(); else ShowResult(AyvagoRun.End(score, false)); }); }
void PauseMenu()  { AyvagoRun.Abandon(); Show(AyvagoScreen.Menu); }
void Show(string screen) { /* … */ AyvagoTestHooks.Publish(screen, score, level); }
```

---

## 5. House rules (every Ayvago game)

These are the studio's non-negotiables, translated to Unity. A game is not done until each
holds.

### 5.1 Brand and flow
- **Ayvago intro on every game.** The intro is `AyvagoBootIntro` (in the package,
  `Runtime/Intro/`): 5.3 s, skippable by tap, click or any key. It runs in the first scene (`Boot`)
  and then loads the next scene in Build Settings. `?nointro` skips it. Do not change its
  choreography.
- **Menu.** From top to bottom:
  - the game's logo (themed art, not plain text) with a small emblem;
  - `BEST: n`;
  - a big **PLAY** button;
  - **EASY / NORMAL** beside PLAY in landscape, under it in portrait;
  - the **HOW TO PLAY** box (§5.6);
  - the bottom row: sound toggle bottom-left, the **Ayvago Games logo** (the PNG lockup, never
    text) bottom-centre, and bottom-right either the language toggle (standalone) or the
    platform leaderboard trophy (`OpenLeaderboard`, embedded).
  - Enter / Space / gamepad A press PLAY.
- **Round flow.**
  1. Menu → PLAY → `AyvagoRun.Begin()` (GHA_SESSION_START) → play.
  2. Play → **result screen**: score, best, **NEW BEST** ribbon, RETRY, MENU, and the ad offer
     (§5.8). The result screen calls `AyvagoRun.End(score, won)`: exactly one GHA_END, plus
     GHA_HAPPY_TIME on a new best (§6).
  3. RETRY → `AyvagoRun.Begin()` again.
- **Pause.**
  - It opens on Esc, P, gamepad Start, a pause button top-right, `GHA_PAUSE`, focus loss or a
    hidden tab.
  - It has **RESUME / RETRY / MENU** and a sound toggle, and the key strip on desktop (§5.6).
  - Pausing sets `Time.timeScale = 0` and ducks the music.
  - MENU or RETRY from pause calls `AyvagoRun.Abandon()` (GHA_GAMEPLAY_STOP), never an END.
- **Best score.** `AyvagoRun.Best`. It is stored locally (PlayerPrefs) and **replaced by
  `config.best`** when the platform sends one, so NEW BEST matches ayvago.com. Easy runs never
  set the best.

### 5.2 Screens and orientation
- **Adaptive.**
  - Landscape **1280×720** design resolution on desktops and tablets.
  - Portrait **720×1280** on phones (`AyvagoDevice.IsPhone`: no hover, coarse pointer, short side under
    600 px; the platform uses the same rule).
  - Decided **once at boot**; `?orient=portrait|landscape` forces it for tests.
- **Layout.**
  - Every screen is laid out for both shapes: two Canvas layouts (or anchors that truly work in
    both), checked with screenshots.
  - Canvas Scaler: Scale With Screen Size, reference 1280×720 or 720×1280, match by the
    orientation.
- **Touch.**
  - Touch controls show on **any touch device** (`AyvagoDevice.Touch`), tablets in landscape included.
  - Buttons are at least 80 px in design units.
  - At rest they are about **70% opaque**, solid while held.
  - Walk by default; sprint is a separate held button.

### 5.3 Text, language and fonts
- **TR and EN.**
  - Every visible string exists in both, in a string table with no hard-coded UI text.
  - The Turkish must be correct (ç ğ ı İ ö ş ü).
  - `AyvagoStrings` is the table (`Register`, `T`). It picks the language, and
    `AyvagoStrings.LocaleChanged` re-renders every text live.
- **Fonts** (the package's `Fonts/`, full TTFs; make TextMeshPro font assets with
  `Fonts/turkish-charset.txt` and check İ, ı, ş, ğ):
  - **modern style** (most games): **Fredoka** for titles and **Nunito** for body text. Smooth
    scaling, rounded UI, no scanlines. Fredoka has no ğ, Ğ, İ, ş or Ş at all: give its font
    asset Nunito Bold as a fallback.
  - **retro style** (retro genre only): **Press Start 2P** for titles and **Pixelify Sans** for
    body text. Press Start 2P draws İ, Ö and Ü like lowercase letters; use the studio's
    "Ayvago Pixel TR" glyphs for those three (`AyvagoPixelTR.ttf` as the primary font asset, with
    Press Start 2P as its fallback), or Pixelify Sans for Turkish titles.
  - All four fonts are SIL OFL. Ship them unmodified.

### 5.4 HUD
- **Chips.** Every always-visible readout (score, lives, timer, ammo...) sits in its own **chip**
  (`AyvagoHudChip`):
  - modern style: iOS-like frosted glass, a rounded dark translucent pill with a thin light border;
  - retro style: a plain bordered box.
- **No bare text.** No floating HUD text without a chip.
- **Placement.** Score, lives and level go on the top row, with the pause button top-right and
  nothing under it.

### 5.5 Audio
- **One sound switch.** The game's sound buttons, the platform's button (GHA_MUTE) and
  GHA_MUTE_STATE are the same switch. `AyvagoAudio` is that switch (`Toggle`, `Muted`,
  `Changed`):
  - report the state once after the handshake and on every change;
  - a platform mute must not toggle back.
  - Use `AudioListener.volume`, not per-source hacks.
- **Music.** A title theme on the menu and a play track; ducked under pause and the result
  screen, and kept playing across the menu → play switch when it is the same track.
- **Effects.** A sound for every action.
- **Autoplay.** Browsers start audio only after the first input. The intro's tap or click
  unlocks it.

### 5.6 Controls: keyboard, touch, gamepad
- **Keyboard and gamepad.**
  - Keyboard: WASD **and** arrows, Space / Enter for the main action, Esc / P to pause.
  - Gamepad (Input System): stick or D-pad to move, A for the main action, B for back, Start to
    pause, RT/LT for gas/brake in driving games.
- **Key help (required in every 3D game).** The keyboard controls are drawn as key caps
  (rounded light caps with a darker bottom edge, arrows drawn as triangles, SPACE / BOŞLUK
  wide), each with a short TR/EN label. They appear in three places, on desktop only (no touch).
  `AyvagoKeyHelp` builds all three (`SetRows`, then `InMenu`, `ShowFirstPlay`, `PauseStrip`):
  1. **Menu:** the HOW TO PLAY box shows the key caps instead of the how-to text. Labels are in
     the box's body colour, inside the box's own frame.
  2. **First play, once per browser:** the keys and labels appear along the bottom of the play
     screen, without a band. Labels have a dark outline. Nothing waits on them; they fade after
     10 s of play and hide while paused. Store the "seen" flag in PlayerPrefs.
  3. **Pause:** a dark rounded strip along the bottom with every key.
  - Use at most 6 rows. Example for a driving game: [W]/[↑] Gas, [S]/[↓] Brake · reverse,
    [A][D]/[←][→] Steer, [SPACE] Use the power, [Esc] Pause.
- **Driving games.** Arrows, a steering wheel or tilt on touch: one choice in the menu. The
  right thumb has GAS, BRAKE and the game's own buttons; the keyboard uses ←/→.

### 5.7 Difficulty
- **EASY / NORMAL** on the menu, remembered between visits (`AyvagoDifficulty`: set `Offered = true`,
  bind the toggle to `Current`).
- **Easy:** more lives and slower threats. Easy runs are practice: they send
  `difficulty: "easy"`, are kept off the leaderboards and never set the best.

### 5.8 Ads (only through the SDK)
- **Rewarded ads are the player's choice, on the result screen only.** Never during play.
  - `continue`: once per run, a lost run goes on (one more life or a checkpoint).
  - `double`: doubles the run's coins or XP, in games with a currency.
  - Hide every ad button while `adsEnabled` is false.
  - A continued run sends **one** GHA_END with `continues: 1` (`AyvagoRun.Continue`).
- **Interstitials** only at natural breaks: result → menu, and every 3rd RETRY
  (`AyvagoSDK.Interstitial("replay", …)`). The platform caps the real frequency.
- **While an ad runs** the game is paused and silent. The bridge does this; restore it after.

### 5.9 Characters
- The player's chosen character (`AyvagoSDK.Character`, one of the five ids) maps to the game's own
  rigged model of that character, when the game has a human hero.
- Every move uses the model's own animation. Never add limbs or props that float.

### 5.10 Theme
- Under the platform's `retro` and `arcade` themes (`AyvagoSDK.HostScanlines`, `AyvagoSDK.ThemeChanged`) the page draws
  CRT scanlines over the frame. Hide the game's own scanline effect then.
- The game keeps its own menu theme (palette, logo, buttons, frame). Platform tokens are optional.

### 5.11 Content and assets
- **Original games only.** No recreation of an existing game's name, characters, art, music or
  levels.
- **No religious structures, words or imagery**, in either language.
- **Assets.**
  - Licenses: CC0 only (Kenney, Quaternius and the other CC0 packs in the studio's
    `docs/assets/LICENSES.md`), or assets the owner supplied. CC-BY and other attribution
    licenses are not allowed.
  - Record every new pack in `LICENSES.md` before use.
  - Unity Asset Store assets: only with the owner's approval, and only if their license allows
    WebGL distribution.
- **No runtime network loads.** No analytics or ad SDKs other than this one, no remote
  Addressables, no CrazyGames or other platform SDKs.

### 5.12 Gameplay quality bar
- **Complete.** A clear goal, levels or rising difficulty, a fail or finish condition, and a
  score that means something.
- **Juicy.** Particles on hits, screen shake on big events, tweens on spawn and despawn, a
  sound for every action.
- **Powers and upgrades.** Pick-ups during play and meta upgrades between runs where they fit
  the genre.
- **Bosses and heroes** use the owner-supplied packs when given.
- **Restart-safe.** RETRY resets everything, with no leaked coroutines or listeners. Memory
  stays flat over 5 restarts.

---

## 6. Leaderboards: how a score is recorded

The platform's own code is the authority here. Every number below was checked against
selchook/ayvago:
- `firebase/functions/src/sessions.ts`;
- `docs/specs/leaderboards.md`;
- ADR 0018;
- `packages/shared/src/manifest.ts`;
- the game player and the bridge in `apps/web`.

`AyvagoRun` keeps the game's side of these rules.

### 6.1 One run, one score session

1. **GHA_SESSION_START** (`AyvagoRun.Begin()`, on PLAY and RETRY): the platform opens a **server
   score session** (`startSession`).
   - Every player has an identity: a guest account at least, created on the first game, or a
     signed-in account. Guests are recorded too and appear on the boards with a guest badge.
     Banned players are refused.
   - The limit is **60 session starts per player per game per hour**. Over it the run is simply
     not registered, and the game is not told.
   - Online matches never open a session: they are not ranked.
2. **GHA_END** (`AyvagoRun.End(score, won)`, once, on the result screen): the platform finishes
   the session (`finishSession`). It sends:
   - the score;
   - the client's run length: wall-clock time from GHA_SESSION_START, measured by the platform
     page;
   - `continues` (0 or 1);
   - `practice: true` for an Easy run.
3. **The server's checks**, in this order. The server measures the run on its own clock:
   - **Too short:** server time under `minDurationMs` → **rejected** (`too-short`), always.
   - **Too high:** score over `maxScore` → rejected; only **flagged** during the game's
     **calibration window**. The window is 14 days from the later of the game's `addedAt` and
     2026-10-26.
   - **Too fast:** score per second (score ÷ max(server seconds, 1)) over `maxPerSecond` →
     rejected; only flagged during calibration.
   - **Duration mismatch:** client and server times differ by more than 10 % of the server time
     plus 3 s → flagged.
   - **Outlier:** once the all-time board has **10 or more players**, a score above **3 × the
     all-time #1** (below #1 ÷ 3 for `asc` boards) → flagged.
   - A flagged score waits for an admin's review (`scoreFlags/`) and is not on any board until
     approved. A rejected run is never recorded.
   - Every finished run counts as play time, even a rejected one.
4. **Recorded:** the run counts on two boards: the **weekly season** (Monday 09:00 UTC to the
   next Monday) and **all-time**.
   - Each board keeps the player's best score; only an improved score writes.
   - Ties go to the earlier time.
   - The all-time entry is the player's best everywhere; GHA_START `config.best` sends it back to
     the game.
5. **Easy runs are practice** (protocol 2.6, ADR 0018):
   - They are sent as `difficulty: "easy"` and go through the same checks.
   - They count in the play stats and earn 5 XP (a run of 20 s or more).
   - They **never** reach a board and never set the best.
   - A flagged practice run earns nothing and is not reviewed.
6. **Continue** (protocol 2.8): a run continued once after a rewarded ad stays **one** session.
   Its single GHA_END carries `continues: 1`, and the boards mark it.
7. **Abandoned runs:** a run left without GHA_END has its time counted, never a score, a play or
   XP. That happens when:
   - a new GHA_SESSION_START comes;
   - the page is left or reloaded;
   - the tab is closed;
   - GHA_END comes without a score.

   The platform accepts **GHA_GAMEPLAY_STOP** but does nothing with it yet: the open run is closed
   as abandoned at the next GHA_SESSION_START or when the page goes away. Send it anyway
   (`AyvagoRun.Abandon()`): it is the protocol's signal.
8. **A second GHA_END** for the same run finds no open session and is ignored by the platform.
   The game must still never send one: it would reach the platform's toolbar as a second result.
9. **GHA_SCORE** checkpoints are optional and not used by the platform yet.
10. **The best in GHA_START** (protocol 2.4):
    - a number: the player's all-time best on Normal;
    - `null`: no score yet;
    - absent: unknown (Firebase off, or the read failed or took over 1.5 s).
    - Solo runs only.

### 6.2 Scoring config

Set in `game.json` under `platform.scoring`. Every field is required there. The studio defaults
(`DEFAULT_SCORING` in `scripts/gen-platform.mjs`) apply when the block is absent. They go into
the manifest and the catalog unchanged.

| Field | Values | Studio default | Notes |
|---|---|---|---|
| `metric` | `^[a-z][a-z0-9_]{1,31}$` | `points` | what is counted |
| `order` | `desc` (higher is better) or `asc` (lower is better: time trials) | `desc` | also `AyvagoRun.Order` |
| `format` | `number` or `time` | `number` | `number` shows whole numbers (12,450 / 12.450); `time` is **milliseconds**, shown as m:ss.SSS |
| `label` | `{ en, tr }` | `Score` / `Puan` | the board's column name |
| `accumulate` | boolean | `false` | sum results per period (e.g. wins) instead of keeping the best; not with `time`. Not implemented by the platform yet |
| `minDurationMs` | integer ≥ 0 | `3000` | shorter runs are rejected; also `AyvagoRun.MinDurationMs` |
| `maxPerSecond` | > 0 | `1000` | score per second of server time |
| `maxScore` | > 0 | `10000000` | |

The limits flag rather than reject during the first two weeks. Set them from real play: the spec
suggests the 99.9th percentile of score per second × 1.5, and the shortest realistic run. The
platform's `games/{id}.scoring` can change them without a deploy.

### 6.3 The game's rules (`AyvagoRun` enforces them)

- **One GHA_SESSION_START per round:** `Begin()` on PLAY and RETRY. A run still open is left
  first.
- **One GHA_END per round, only from the result screen:** `End(score, won)`. A second `End` is
  ignored. While the continue is offered, `End` waits for the player's choice.
- **Whole numbers.**
  - The platform accepts any finite number ≥ 0. A negative score is refused and the run is not
    recorded. The bridge drops anything above 10¹².
  - Boards show `number` scores without decimals, and `time` scores are milliseconds.
  - So `End` rounds the score and clamps it at 0.
- **No END for a short unfinished round.** A round shorter than `minDurationMs` that the player
  did not win (quit or lost at once) sends **no GHA_END**: the server would reject it as too
  short. It is left like an abandoned run: GHA_GAMEPLAY_STOP, and its time still counts.
- **Time trials.** On an `asc` board, a run that was not won has no time. It is sent **without a
  score** (its time counts, no board): a DNF must never rank first.
- **Leaving a round:** MENU or RETRY from pause → `Abandon()` (GHA_GAMEPLAY_STOP), never an END.
- **Celebrate on a new best:** `End` sends GHA_HAPPY_TIME when the run beats `Best` by the
  board's order. Easy runs never do.
- **The best comes from the platform when it sends one**: it replaces the PlayerPrefs best at the
  handshake, `null` clears it, and absent keeps it.
- **GHA_SCORE checkpoints** (`Checkpoint(score)`) are optional.

---

## 7. What the studio repo needs for each Unity game

In `selchook/ayvago-games`:

| Path | Content |
|---|---|
| `games/<slug>/game.json` | as for every game, plus `"engine": "unity"`. That means `id` (slug), `title {en,tr}`, `description {en,tr}`, `howTo {en,tr}`, `genres` (the first is the primary category), `orientation: "adaptive"`, `controls`, `version` (semver; bump it on every change), `credits` and `platform { addedAt, ageRating?, featured?, scoring? }`. `npm run new-game -- <slug> "<Title>" --unity` scaffolds it |
| `games/<slug>/guide.json` | the game page's written guide in EN and TR: `about` (2–3 paragraphs), `howToPlay` (3–8 steps), `controls` (keyboard, touch, gamepad), `tips` (3–8), `features`, `faq`. Written from the real game (new-game skill §7i) |
| `public/games/<slug>/` | the WebGL build (`index.html`, `Build/`, `TemplateData/`), written by **Ayvago → Build WebGL…**. Compression Disabled. The generated `ayvago.json` and `ayvago/` sit next to it; the build menu never touches them |

A Unity game has **no** `main.ts` and **no** `games/<slug>/index.html`.

**Ayvago → Build WebGL…** keeps the studio path per machine (EditorPrefs) and the slug per project
(`ProjectSettings/Ayvago.json`). It builds with the Ayvago template and replaces only `index.html`,
`Build/` and `TemplateData/` in `public/games/<slug>/` (`StreamingAssets/` too, if the build has
one).

Then the studio pipeline does the same as for a Phaser game:

```bash
node scripts/gen-registry.mjs                        # checks game.json and the build; records "engine": "unity"
node scripts/gen-platform.mjs --live                 # ayvago.json manifest, catalog entry, guide
npm run test:unity                                   # the package and the Unity pipeline (no Unity needed)
node scripts/smoke-test.mjs --dev --serial <slug>    # the game itself, through its test hooks (§8)
node scripts/platform-harness.mjs --dev <slug>       # the GHA flow, embedded like ayvago.com
node scripts/gen-store-assets.mjs --dev <slug>       # cover, cards (EN/TR, landscape and portrait), icon, screenshot, logos, thumbnail
npm run validate:platform                            # the manifest and every art file
```

- **Dev server.** `npm run dev` serves the build at `/games/<slug>/`.
- **Store art.** The capture reaches the menu and play through the hooks.
  - A Unity game gets the plain title logo. Themed menu logos are a Phaser feature.
  - A `CARD` entry's `stage` is sent as the `stage <name>` command.
- **Tests and CI.**
  - `npm run test:changed` tests a Unity game when its folder or its build changes.
  - A change to `unity/`, `tools/unity-*` or the Unity scripts runs `test:unity`.
  - CI checks that the template's adapter bundle is current.
- **Release.** Merging to `main` deploys on Vercel. The platform's catalog sync then lists the
  game. The platform sees no difference from a Phaser game.

Studio commands for Unity:

| | |
|---|---|
| `npm run check:unity` | the package without Unity: `.meta` files (every asset, unique GUIDs), this document's copy in `Documentation~/`, the adapter bundle, the JS, and the C# compiled by `mcs` against `tools/unity-check/stubs` (Runtime for WebGL with both input backends, Runtime and Editor for the Editor). `--fix-meta` writes missing `.meta` files |
| `npm run build:unity-adapter` | rebuilds `TemplateData/ayvago-adapter.js` (`--check`: fail when stale) |
| `npm run test:unity` | `check:unity`, then the smoke test and the platform harness of the **Unity fixture** |
| `--unity-fixture` | on `smoke-test.mjs`, `platform-harness.mjs` and `gen-store-assets.mjs`: run on the fixture |
| `node scripts/unity-fixture.mjs --out <dir>` | stage the fixture by hand; then `AYVAGO_UNITY_FIXTURE=<dir> npm run dev` and open `/games/unity-fixture/` |

**The fixture** (`tools/unity-fixture`) is a fake Unity build:
- the package's real template and `Ayvago.jslib`;
- a stand-in for Unity's loader;
- a canvas game that does what a game built on the package does.

It is staged in a temporary folder only while a script serves it. It never enters `public/`,
the registry, the catalog or `dist/`.

---

## 8. The test-hook contract

The studio's smoke test, platform harness and store-art capture cannot see inside Unity. They
drive a Unity game only through `window.__ayvago`, which the template's bridge provides:

| Member | |
|---|---|
| `engine` | `'unity'` |
| `ready` | Unity runs and the game has published a state |
| `state()` | the last state the game published (below), or null |
| `command(name, arg?)` | sends `OnTestCommand {name, arg}` into Unity: `AyvagoTestHooks.Command(name, arg)` |
| `orientation`, `locale`, `embedded`, `progress`, `gameId` | conveniences |

**The state.** The game calls `AyvagoTestHooks.Publish(screen, score, level, extra)` on every
screen change and whenever the score changes. An unchanged state is not sent again. The SDK adds
its own fields:

| Field | |
|---|---|
| `screen` | `intro`, `menu`, `play`, `pause` or `result` (the intro publishes `intro` itself) |
| `score`, `level`, `extra` | the game's (`extra`: any JSON or text for the game's own tests) |
| `orientation` | `landscape` or `portrait` |
| `locale` | `en` or `tr` |
| `embedded` | |
| `difficulty`, `offersDifficulty` | |
| `offersContinue`, `continueOffered` | the game offers the continue; the result screen shows it right now (`AyvagoTestHooks.ContinueOffered`) |
| `runActive`, `continues` | from `AyvagoRun` |
| `hasBest`, `best` | |
| `muted` | the player's switch |
| `silenced` | muted, or an ad holds the audio |
| `adShowing`, `timeScale` | |
| `engine`, `sdk` | |

**The commands.** Every game must handle these, exactly as its own buttons do:

| Command | Does |
|---|---|
| `play` | PLAY on the menu (also skips the intro) |
| `pause` / `resume` | open / close the pause overlay |
| `retry` | RETRY on the pause overlay or the result screen |
| `menu` | MENU on the pause overlay or the result screen (with its interstitial) |
| `end [score]` | end the round now as lost, adding `score` first, and open the result screen (it holds the END while the continue is offered) |
| `continue` | press CONTINUE on the result screen (games with the continue) |
| `stage <name>` | optional: set up a scene for the store art |

The SDK handles these itself and still raises `Command`, so a menu can redraw:
- `sound`: the game's sound switch;
- `difficulty easy|normal`;
- `locale en|tr`.

`?nointro`, `?lang=tr|en`, `?orient=portrait|landscape` and `?keyhelp` work on every build.

---

## 9. Testing (Definition of Done)

1. **Standalone.** The game runs in a plain browser tab, falls back to the browser language,
   shows no ads and has no console errors.
2. **`npm run test:unity`** passes in the studio, which proves the package and the pipeline.
3. **Smoke test.** Run `node scripts/smoke-test.mjs --dev --serial <slug>`. It covers:
   - load → menu (a tap skips the intro) → `play` → random keys and taps → `end` → result →
     `retry` → play;
   - no page error, console error or failed request;
   - a canvas that is not blank;
   - the right orientation on a desktop and on an emulated phone.
4. **Platform harness.** Run `node scripts/platform-harness.mjs --dev <slug>`. It embeds the game
   cross-origin like ayvago.com and checks:
   - `GHA_READY` (with the right game id) → `GHA_START`
   - `GHA_LOADING`
   - the platform's locale and best adopted
   - the sound switch reported (`GHA_MUTE_STATE` false, true, false), with no echo of `GHA_MUTE`
   - `GHA_SESSION_START`
   - pause and mute
   - one `GHA_END` with the right difficulty, and no `GHA_HAPPY_TIME` below the platform best
   - no ad offer when ads are off
   - the continue flow (games with `offersContinue`):
     - the END is held;
     - the rewarded ad holds the game;
     - one session;
     - one END with `continues: 1`;
     - the `menu` interstitial;
     - RETRY declines the offer.
5. **Screenshots** in both orientations and both languages:
   - menu, play, pause, result and every inner screen;
   - no overlap, no clipped Turkish, HUD in chips, touch buttons only on touch devices.
6. **Phones.** A mid-range phone (or Chrome's device emulation with CPU throttling) loads
   within budget and holds 30+ fps.
7. **Gamepad.** The whole game is playable with a pad.
8. **Memory.** Five RETRYs leave the heap and texture memory flat.
