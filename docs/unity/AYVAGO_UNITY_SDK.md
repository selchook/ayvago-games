# Ayvago Unity SDK: building Unity (WebGL) games for ayvago.com

This document is the contract for a Unity game on the Ayvago platform. It covers the platform
protocol, the bridge between C# and the page, and the house rules every Ayvago game follows
(the same rules as the studio's Phaser games). Give it to whoever builds the game, human or AI,
together with the game's concept.

Status: version 1 of the Unity contract (platform protocol 2.8, adapter 2.8.0). The reference
code below is the starting point for the `com.ayvago.sdk` Unity package; when that package
exists, it replaces the copy-paste code here.

---

## 1. How a Unity game reaches players

```
Unity project (its own repo)  ──WebGL build──▶  studio repo selchook/ayvago-games
                                                 games/<slug>/  (game.json, guide.json, build/)
                                                        │  npm run platform / store-assets
                                                        ▼
                                  Vercel: https://ayvago-games-nine.vercel.app/games/<slug>/
                                                        │  catalog sync (platform repo)
                                                        ▼
                                  ayvago.com game page: the build runs in a sandboxed iframe
```

- **Two repos.** The Unity project lives in its own repository (Unity projects are large). Only
  the WebGL build output, plus the game's metadata and art, comes into the studio repo.
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

## 4. The bridge (reference implementation)

Three pieces:
- the adapter as JS in the template;
- a `.jslib` that C# calls;
- `AyvagoSDK.cs`, a singleton that C# gameplay code uses.

The platform's events reach C# through `unityInstance.SendMessage`.

### 4.1 The adapter as plain JS

Build it from the studio repo whenever the adapter changes:

```bash
npx esbuild src/core/ayvago/adapter.ts --bundle --format=iife --global-name=AyvagoAdapter \
  --target=es2017 --outfile=Assets/WebGLTemplates/Ayvago/ayvago-adapter.js
```

`window.AyvagoAdapter.createPlatformAdapter({ gameId })` then returns a Promise of the adapter
(§3); the API is in the `PlatformAdapter` interface of `adapter.ts`.

### 4.2 `Assets/Plugins/WebGL/Ayvago.jslib`

```js
mergeInto(LibraryManager.library, {
  AyvagoConfigJson: function () {
    var s = JSON.stringify(window.AyvagoBridge.configForUnity());
    var n = lengthBytesUTF8(s) + 1, p = _malloc(n);
    stringToUTF8(s, p, n);
    return p;
  },
  AyvagoCall: function (method, arg) {
    window.AyvagoBridge.call(UTF8ToString(method), UTF8ToString(arg));
  },
});
```

### 4.3 `Assets/WebGLTemplates/Ayvago/index.html` (the parts that matter)

```html
<script src="ayvago-adapter.js"></script>
<script>
  // GHA_READY goes out at page load, while Unity downloads.
  const GAME_ID = '%UNITY_WEB_NAME%'.toLowerCase().replace(/[^a-z0-9]/g, '');
  const ready = window.AyvagoAdapter.createPlatformAdapter({ gameId: GAME_ID });
  let adapter = null, unity = null, queue = [];
  const toUnity = (method, data) => {
    const json = JSON.stringify(data ?? {});
    if (unity) unity.SendMessage('AyvagoSDK', method, json); else queue.push([method, json]);
  };
  ready.then((a) => {
    adapter = a;
    a.onPause(() => toUnity('OnPlatformPause'));
    a.onResume(() => toUnity('OnPlatformResume'));
    a.onMute((muted) => toUnity('OnPlatformMute', { muted }));
    a.onLocaleChange((locale) => toUnity('OnPlatformLocale', { locale }));
    a.onThemeChange((t) => toUnity('OnPlatformTheme', { theme: t.theme, colorMode: t.colorMode }));
  });
  window.AyvagoBridge = {
    configForUnity() {
      const c = adapter && adapter.config;
      const lang = new URLSearchParams(location.search).get('lang');
      return {
        embedded: !!c,
        locale: lang || (adapter ? adapter.locale : navigator.language).slice(0, 2),
        adsEnabled: !!(c && c.adsEnabled),
        hasBest: !!c && 'best' in c, best: c && typeof c.best === 'number' ? c.best : -1,
        character: (c && c.character) || '', theme: (c && c.theme) || '',
        touch: matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0,
        phone: matchMedia('(hover: none) and (pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600,
      };
    },
    call(method, arg) {
      if (!adapter) return;
      const a = arg ? JSON.parse(arg) : {};
      switch (method) {
        case 'sessionStart': adapter.gameplayStart(); break;
        case 'gameplayStop': adapter.gameplayStop(); break;
        case 'score': adapter.submitScore(a.score); break;
        case 'end': adapter.endGame(a); break;
        case 'celebrate': adapter.celebrate(); break;
        case 'mute': adapter.reportMute(!!a.muted); break;
        case 'leaderboard': adapter.openLeaderboard(); break;
        case 'rewarded': adapter.requestRewarded(a.placement).then((ok) => toUnity('OnAdResult', { id: a.id, rewarded: ok })); break;
        case 'interstitial': adapter.requestInterstitial(a.placement).then(() => toUnity('OnAdResult', { id: a.id, rewarded: false })); break;
      }
    },
  };
  // In the loader:
  //   createUnityInstance(canvas, config, (p) => { ready.then((a) => a.loadingProgress(p)); bar(p); })
  //     .then((instance) => { unity = instance; queue.forEach(([m, j]) => unity.SendMessage('AyvagoSDK', m, j)); queue = []; });
</script>
```

The loader screen shows the game's name over a dark background and a progress bar. It shows
nothing else: the Ayvago intro plays inside Unity (§5.1). The canvas fills the frame
(`width:100%; height:100%`), with no Unity footer, logo or fullscreen button: the platform has
its own.

### 4.4 `AyvagoSDK.cs` (on a GameObject named `AyvagoSDK`, DontDestroyOnLoad)

```csharp
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using UnityEngine;

public class AyvagoSDK : MonoBehaviour
{
    [Serializable] public class Config { public bool embedded, adsEnabled, hasBest, touch, phone; public long best; public string locale, character, theme; }
    [Serializable] class Msg { public bool muted, rewarded; public string locale, theme, colorMode; public int id; }
    [Serializable] class EndMsg { public long score; public bool won; public string difficulty; public int continues; }

    public static AyvagoSDK I { get; private set; }
    public static Config Cfg { get; private set; } = new Config { locale = "en", best = -1 };
    public static event Action Paused, Resumed;
    public static event Action<bool> MuteChanged;
    public static event Action<string> LocaleChanged, ThemeChanged;

#if UNITY_WEBGL && !UNITY_EDITOR
    [DllImport("__Internal")] static extern string AyvagoConfigJson();
    [DllImport("__Internal")] static extern void AyvagoCall(string method, string arg);
#else
    static string AyvagoConfigJson() => JsonUtility.ToJson(new Config { locale = "en", best = -1 });
    static void AyvagoCall(string method, string arg) => Debug.Log($"[ayvago] {method} {arg}");
#endif

    readonly Dictionary<int, Action<bool>> pendingAds = new();
    int nextAd = 1;

    void Awake()
    {
        if (I != null) { Destroy(gameObject); return; }
        I = this; DontDestroyOnLoad(gameObject);
        Cfg = JsonUtility.FromJson<Config>(AyvagoConfigJson());
    }

    /// Call again once the intro ends: the handshake (≤ 3 s) has finished by then.
    public static void Refresh() => Cfg = JsonUtility.FromJson<Config>(AyvagoConfigJson());

    public static void SessionStart() => AyvagoCall("sessionStart", "");
    public static void GameplayStop() => AyvagoCall("gameplayStop", "");
    public static void SubmitScore(long score) => AyvagoCall("score", "{\"score\":" + score + "}");
    /// Exactly once per round, on the result screen. Easy runs send "easy" (they stay off the leaderboards).
    public static void EndGame(long score, bool won, bool easy, bool continued) =>
        AyvagoCall("end", JsonUtility.ToJson(new EndMsg { score = score, won = won, difficulty = easy ? "easy" : "normal", continues = continued ? 1 : 0 }));
    public static void Celebrate() => AyvagoCall("celebrate", "");
    public static void ReportMute(bool muted) => AyvagoCall("mute", "{\"muted\":" + (muted ? "true" : "false") + "}");
    public static void OpenLeaderboard() => AyvagoCall("leaderboard", "");
    public static void Rewarded(string placement, Action<bool> done) => Ad("rewarded", placement, done);
    public static void Interstitial(string placement, Action done) => Ad("interstitial", placement, _ => done?.Invoke());

    static void Ad(string format, string placement, Action<bool> done)
    {
        if (!Cfg.adsEnabled) { done?.Invoke(false); return; }
        int id = I.nextAd++;
        I.pendingAds[id] = done;
        AudioListener.pause = true; Time.timeScale = 0f;   // silent and still while the ad runs
        AyvagoCall(format, "{\"id\":" + id + ",\"placement\":\"" + placement + "\"}");
    }

    // ---- called by the page (SendMessage) ----
    void OnPlatformPause(string _) => Paused?.Invoke();
    void OnPlatformResume(string _) => Resumed?.Invoke();
    void OnPlatformMute(string json) => MuteChanged?.Invoke(JsonUtility.FromJson<Msg>(json).muted);
    void OnPlatformLocale(string json) { var l = JsonUtility.FromJson<Msg>(json).locale; Cfg.locale = l; LocaleChanged?.Invoke(l); }
    void OnPlatformTheme(string json) { var t = JsonUtility.FromJson<Msg>(json).theme; Cfg.theme = t; ThemeChanged?.Invoke(t); }
    void OnAdResult(string json)
    {
        var m = JsonUtility.FromJson<Msg>(json);
        AudioListener.pause = false; Time.timeScale = 1f;
        if (pendingAds.Remove(m.id, out var done)) done?.Invoke(m.rewarded);
    }
}
```

`best` is `-1` when unknown and `hasBest` says whether the platform sent one. `hasBest && best < 0`
means the platform sent `null`: the player has no score yet.

---

## 5. House rules (every Ayvago game)

These are the studio's non-negotiables, translated to Unity. A game is not done until each
holds.

### 5.1 Brand and flow
- **Ayvago intro on every game.** The intro is `AyvagoBootIntro.cs`: 5.3 s, skippable by tap,
  click or any key. It is the first scene after load. Do not change its choreography.
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
  1. Menu → PLAY → `SessionStart()` → play.
  2. Play → **result screen**: score, best, **NEW BEST** ribbon, RETRY, MENU, and the ad offer
     (§5.8). The result screen sends `EndGame(...)` exactly once, plus `Celebrate()` on a new best.
  3. RETRY → `SessionStart()` again.
- **Pause.**
  - It opens on Esc, P, gamepad Start, a pause button top-right, `GHA_PAUSE`, focus loss or a
    hidden tab.
  - It has **RESUME / RETRY / MENU** and a sound toggle, and the key strip on desktop (§5.6).
  - Pausing sets `Time.timeScale = 0` and ducks the music.
  - MENU from pause sends `GameplayStop()`.
- **Best score.** Stored locally (PlayerPrefs) and **replaced by `config.best`** when the
  platform sends one, so NEW BEST matches ayvago.com. Easy runs never set the best.

### 5.2 Screens and orientation
- **Adaptive.**
  - Landscape **1280×720** design resolution on desktops and tablets.
  - Portrait **720×1280** on phones (`Cfg.phone`: no hover, coarse pointer, short side under
    600 px; the platform uses the same rule).
  - Decided **once at boot**; `?orient=portrait|landscape` forces it for tests.
- **Layout.**
  - Every screen is laid out for both shapes: two Canvas layouts (or anchors that truly work in
    both), checked with screenshots.
  - Canvas Scaler: Scale With Screen Size, reference 1280×720 or 720×1280, match by the
    orientation.
- **Touch.**
  - Touch controls show on **any touch device** (`Cfg.touch`), tablets in landscape included.
  - Buttons are at least 80 px in design units.
  - At rest they are about **70% opaque**, solid while held.
  - Walk by default; sprint is a separate held button.

### 5.3 Text, language and fonts
- **TR and EN.**
  - Every visible string exists in both, in a string table with no hard-coded UI text.
  - The Turkish must be correct (ç ğ ı İ ö ş ü).
  - `Cfg.locale` picks the language, and `LocaleChanged` re-renders every text live.
- **Fonts** (TextMeshPro font assets with the Turkish glyphs included; check İ, ı, ş, ğ):
  - **modern style** (most games): **Fredoka** for titles and **Nunito** for body text. Smooth
    scaling, rounded UI, no scanlines.
  - **retro style** (retro genre only): **Press Start 2P** for titles and **Pixelify Sans** for
    body text. Press Start 2P draws İ, Ö and Ü like lowercase letters; use the studio's
    "Ayvago Pixel TR" glyphs for those three, or Pixelify Sans for Turkish titles.
  - All four fonts are SIL OFL. Ship them unmodified.

### 5.4 HUD
- **Chips.** Every always-visible readout (score, lives, timer, ammo...) sits in its own **chip**:
  - modern style: iOS-like frosted glass, a rounded dark translucent pill with a thin light border;
  - retro style: a plain bordered box.
- **No bare text.** No floating HUD text without a chip.
- **Placement.** Score, lives and level go on the top row, with the pause button top-right and
  nothing under it.

### 5.5 Audio
- **One sound switch.** The game's sound buttons, the platform's button (`MuteChanged`) and
  `ReportMute` are the same switch:
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
  wide), each with a short TR/EN label. They appear in three places, on desktop only (no touch):
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
- **EASY / NORMAL** on the menu, remembered between visits.
- **Easy:** more lives and slower threats. Easy runs are practice: they send
  `difficulty: "easy"`, are kept off the leaderboards and never set the best.

### 5.8 Ads (only through the SDK)
- **Rewarded ads are the player's choice, on the result screen only.** Never during play.
  - `continue`: once per run, a lost run goes on (one more life or a checkpoint).
  - `double`: doubles the run's coins or XP, in games with a currency.
  - Hide every ad button while `adsEnabled` is false.
  - A continued run sends **one** `EndGame` with `continued: true`.
- **Interstitials** only at natural breaks: result → menu, and every 3rd RETRY
  (`Interstitial("replay", …)`). The platform caps the real frequency.
- **While an ad runs** the game is paused and silent. The bridge does this; restore it after.

### 5.9 Characters
- The player's chosen character (`Cfg.character`, one of the five ids) maps to the game's own
  rigged model of that character, when the game has a human hero.
- Every move uses the model's own animation. Never add limbs or props that float.

### 5.10 Theme
- Under the platform's `retro` and `arcade` themes (`Cfg.theme`, `ThemeChanged`) the page draws
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

## 6. What the studio repo needs for each Unity game

In `games/<slug>/` of `selchook/ayvago-games`:

| File | Content |
|---|---|
| `game.json` | `id` (slug), `title {en,tr}`, `description {en,tr}`, `howTo {en,tr}`, `genres` (first = primary category), `orientation: "adaptive"`, `controls`, `version` (semver; bump on every change), `credits`, `platform { addedAt, ageRating?, featured? }`, and `"engine": "unity"` |
| `guide.json` | the game page's written guide in EN and TR: `about` (2–3 paragraphs), `howToPlay` (3–8 steps), `controls` (keyboard, touch, gamepad), `tips` (3–8), `features`, `faq`. Written from the real game. |
| `build/` | the WebGL output (`index.html`, `Build/`, `TemplateData/`), Compression Disabled |

Then the studio pipeline does the rest:
- `npm run platform` writes the `ayvago.json` manifest and the catalog entry.
- `npm run store-assets` captures the cover, cards (EN/TR, landscape and portrait), icon,
  screenshot and logos. Expose `window.__ayvago` test hooks (§7) so the capture can reach play.
- Merging to `main` deploys on Vercel; the platform's catalog sync then lists the game.

> Studio work still to do before the first Unity game ships: teach `gen-registry`, the build
> and the smoke test about `"engine": "unity"` (copy `build/` as is, skip the Phaser
> typecheck, drive the Unity build through its test hooks).

---

## 7. Testing (Definition of Done)

1. **Standalone.** The game runs in a plain browser tab, falls back to the browser language,
   shows no ads and has no console errors.
2. **Platform harness.** Run the studio's `npm run test:platform -- <slug>`. It embeds the game
   cross-origin like ayvago.com and checks:
   - `GHA_READY` → `GHA_START`
   - `GHA_LOADING`
   - `GHA_SESSION_START`
   - pause and mute
   - `GHA_MUTE_STATE`
   - one `GHA_END` with the right difficulty
   - no ad buttons when ads are off
   - the continue ad flow
3. **Test hooks.** The page exposes `window.__ayvago = { state(), start(level), ... }`, through
   the bridge, so smoke tests and store art can start a round, read the score and stage a shot.
   `?nointro`, `?lang=tr|en`, `?orient=…` and `?keyhelp` work.
4. **Screenshots** in both orientations and both languages:
   - menu, play, pause, result and every inner screen;
   - no overlap, no clipped Turkish, HUD in chips, touch buttons only on touch devices.
5. **Phones.** A mid-range phone (or Chrome's device emulation with CPU throttling) loads
   within budget and holds 30+ fps.
6. **Gamepad.** The whole game is playable with a pad.
7. **Memory.** Five RETRYs leave the heap and texture memory flat.

---

## 8. Recommended setup

1. **One Unity package, `com.ayvago.sdk`**, kept in its own small repo (or under `unity/` in the
   studio repo). It contains:
   - the bridge of §4;
   - the `Ayvago` WebGL template;
   - `AyvagoBootIntro`;
   - prefabs for the house UI: menu, HOW TO PLAY box with key caps, pause with key strip,
     result screen with ad buttons, HUD chip, touch buttons;
   - the four fonts as TMP assets with Turkish glyphs;
   - a string-table helper for TR/EN.

   Every Unity game installs it through the Package Manager (git URL), so a fix reaches every
   game.
2. **One Unity project per game**, built with the `Ayvago` template. A build script
   (`Ayvago → Build WebGL`) writes straight into `games/<slug>/build/` of a studio checkout.
3. **The studio pipeline treats Unity builds like any other game.** Same manifest, guide, store
   art, catalog sync and tests. The platform sees no difference.
