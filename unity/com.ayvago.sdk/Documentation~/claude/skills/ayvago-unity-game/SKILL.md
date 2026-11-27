---
name: ayvago-unity-game
description: Build, change or fix an Ayvago Unity (WebGL) game for ayvago.com with the com.ayvago.sdk package — scenes and the brand intro, menu / pause / result flow, leaderboard-safe runs (AyvagoRun), ads, key help, HUD chips, adaptive layout, TR/EN text and fonts, test hooks — and deliver the build into the studio repo selchook/ayvago-games. Use it for any work in this Unity project.
---

# Building an Ayvago Unity game

The contract is `AYVAGO_UNITY_SDK.md`, next to this file. It has every rule, the package API
(§4), the leaderboard rules (§6), the studio steps (§7), the test hooks (§8) and the Definition of
Done (§9). Read the sections a task touches before you change code. This skill is the how-to.

## 1. Check the setup first

- The project is Unity 2022.3 LTS or Unity 6, with the WebGL module.
- `Packages/manifest.json` has `"com.ayvago.sdk": "https://github.com/selchook/ayvago-games.git?path=/unity/com.ayvago.sdk"`.
  If not, ask the owner to add it (Package Manager → Add package from git URL), or add it
  yourself and let Unity resolve it.
- `Assets/WebGLTemplates/Ayvago/` exists. If not: **Ayvago → Install WebGL Template**.
- The WebGL player settings are the Ayvago ones. If not: **Ayvago → Apply Player Settings**.
- Input: the Input System package or the legacy Input Manager. The package supports both. Read
  the keyboard **and** a gamepad (Input System) for every action.
- Render pipeline: URP with mobile-friendly settings for 3D games.

You cannot press Unity menu items yourself. Ask the owner to run them, or do in code what they
do (the Editor scripts in `Packages/com.ayvago.sdk/Editor` show how).

## 2. Scenes

```
Build Settings:  0 Boot   (empty GameObject + AyvagoBootIntro)
                 1 Game   (the whole game: menu, play, pause and result as screens of one scene)
```

- **`Boot`**: an empty GameObject with the `AyvagoBootIntro` component. It builds its own canvas,
  plays 5.3 s (skippable by tap, click or key) and loads the next scene by build index.
  - `?nointro` skips it.
  - It publishes the test state `intro`.
  - Never change its timings, geometry, easing or colours.
- **`Game`**: one scene with a flow controller (below). RETRY resets the round in place, so
  nothing leaks between rounds. Keep the scene list short: every scene adds to the download.
- `AyvagoSDK` creates itself before the first scene: never put one in a scene.

## 3. Boot code (once, in the Game scene's controller `Awake`)

```csharp
AyvagoDevice.Decide(OrientationSetting.Adaptive);   // landscape 1280×720, portrait 720×1280 on phones
AyvagoDevice.Configure(canvasScaler);                // every Canvas Scaler of the game
AyvagoRun.Order = ScoreOrder.Desc;                   // = game.json platform.scoring.order
AyvagoRun.MinDurationMs = 3000;                      // = game.json platform.scoring.minDurationMs
AyvagoRun.OffersContinue = true;                     // if the result screen offers the rewarded continue
AyvagoDifficulty.Offered = true;                     // if the menu has EASY / NORMAL
AyvagoUI.Retro = false;                              // true only for retro-genre games
GameStrings.Register();                              // every string, EN and TR (§6)
AyvagoKeyHelp.SetRows(
    new AyvagoKeyRow("kh_move", "A D", "Left Right"),
    new AyvagoKeyRow("kh_jump", "W Space", "Up"),
    new AyvagoKeyRow("kh_pause", "Esc"));          // at most 6 rows
```

## 4. The flow controller

One MonoBehaviour owns the screens and the round. This is the shape every game follows (adapt
names and UI; keep the calls):

```csharp
using System.Globalization;
using Ayvago;
using UnityEngine;

public sealed class GameFlow : MonoBehaviour
{
    [SerializeField] RectTransform playRoot, pauseRoot, howToBox;
    string screen = AyvagoScreen.Menu;
    double score;
    bool won;
    AyvagoKeyHelpHint firstKeys;
    RectTransform pauseStrip;

    void Awake()
    {
        // … boot code (§3) …
        AyvagoSDK.Paused += Pause;                        // GHA_PAUSE and a hidden tab
        AyvagoStrings.LocaleChanged += OnLocale;          // redraw every text
        AyvagoAudio.Changed += OnSound;                   // sound button icons
        AyvagoTestHooks.Command += OnCommand;
    }

    void OnDestroy()
    {
        AyvagoSDK.Paused -= Pause;
        AyvagoStrings.LocaleChanged -= OnLocale;
        AyvagoAudio.Changed -= OnSound;
        AyvagoTestHooks.Command -= OnCommand;
    }

    void Start() => ShowMenu();

    void OnApplicationFocus(bool focus) { if (!focus) Pause(); }

    // ---- menu
    void ShowMenu()
    {
        Time.timeScale = 1f;
        // BEST: AyvagoRun.Best; trophy button (embedded) → AyvagoSDK.OpenLeaderboard(); language toggle (standalone) → AyvagoStrings.SetLang(…)
        if (AyvagoKeyHelp.InMenu(howToBox, howToBodyColour) == null) ShowHowToText();
        Show(AyvagoScreen.Menu);
    }

    // ---- a round
    public void Play()                                    // PLAY, Enter, Space, gamepad A
    {
        AyvagoRun.Begin();                                // GHA_SESSION_START
        ResetRound();                                     // score = 0, lives, level, spawners …
        Time.timeScale = 1f;
        Show(AyvagoScreen.Play);
        firstKeys = AyvagoKeyHelp.ShowFirstPlay(playRoot);  // only the first time on a desktop
    }

    public void Pause()
    {
        if (screen != AyvagoScreen.Play) return;
        Time.timeScale = 0f;                              // and duck the music
        pauseStrip = AyvagoKeyHelp.PauseStrip(pauseRoot);
        Show(AyvagoScreen.Pause);
    }

    public void Resume()
    {
        if (pauseStrip != null) Destroy(pauseStrip.gameObject);
        Time.timeScale = 1f;
        Show(AyvagoScreen.Play);
    }

    public void RetryFromPause() { AyvagoRun.Abandon(); Play(); }       // GHA_GAMEPLAY_STOP, then a new session
    public void MenuFromPause()  { AyvagoRun.Abandon(); ShowMenu(); }

    // ---- the round ends (out of lives, time up, finish line …)
    void RoundOver(bool hasWon)
    {
        won = hasWon;
        firstKeys?.Close();
        if (!won && AyvagoRun.CanContinue)
        {
            AyvagoTestHooks.ContinueOffered = true;       // result screen with CONTINUE; END waits
            ShowResult(null);
        }
        else ShowResult(AyvagoRun.End(score, won));       // the one GHA_END (+ GHA_HAPPY_TIME on a new best)
    }

    public void Continue()                                // CONTINUE (rewarded ad, the player's choice)
    {
        AyvagoRun.Continue(ok =>
        {
            if (ok) { GiveOneMoreLife(); Show(AyvagoScreen.Play); }
            else ShowResult(AyvagoRun.End(score, won));
        });
    }

    public void RetryFromResult()                         // RETRY, Enter
    {
        if (AyvagoRun.Active) AyvagoRun.End(score, won);   // the player turned the continue down
        if (AyvagoRun.RunsStarted % 3 == 0) AyvagoSDK.Interstitial("replay", Play);
        else Play();
    }

    public void MenuFromResult()
    {
        if (AyvagoRun.Active) AyvagoRun.End(score, won);
        AyvagoSDK.Interstitial("menu", ShowMenu);
    }

    void ShowResult(AyvagoRunResult? r)
    {
        // score, AyvagoRun.Best, NEW BEST when r.Value.NewBest, "Easy: not ranked" (diffEasyNote) when r.Value.Practice,
        // CONTINUE only while AyvagoRun.CanContinue, RETRY, MENU; music ducked
        Show(AyvagoScreen.Result);
    }

    // ---- test hooks (§8 of the contract): the same paths as the buttons
    void OnCommand(string name, string arg)
    {
        switch (name)
        {
            case "play": if (screen == AyvagoScreen.Menu) Play(); break;
            case "pause": Pause(); break;
            case "resume": if (screen == AyvagoScreen.Pause) Resume(); break;
            case "retry": if (screen == AyvagoScreen.Pause) RetryFromPause(); else if (screen == AyvagoScreen.Result) RetryFromResult(); break;
            case "menu": if (screen == AyvagoScreen.Pause) MenuFromPause(); else if (screen == AyvagoScreen.Result) MenuFromResult(); break;
            case "end":
                if (screen == AyvagoScreen.Pause) Resume();
                if (screen != AyvagoScreen.Play) break;
                double add;
                if (double.TryParse(arg, NumberStyles.Float, CultureInfo.InvariantCulture, out add)) score += add;
                RoundOver(false);
                break;
            case "continue": if (AyvagoTestHooks.ContinueOffered) Continue(); break;
            case "stage": /* optional: set up a scene for the store art */ break;
        }
    }

    void Show(string s)
    {
        screen = s;
        // activate that screen's UI …
        AyvagoTestHooks.Publish(s, score, level);
    }

    void Update()
    {
        if (screen == AyvagoScreen.Play) AyvagoTestHooks.Publish(screen, score, level);   // unchanged states are not resent
    }
}
```

Rules this shape keeps (contract §5.1, §6):
- One `Begin` per round: PLAY and RETRY.
- One `End` per round, only from the result screen. Never an END from the pause overlay: it
  calls `Abandon`.
- While CONTINUE is offered, `End` waits until the player declines (RETRY, MENU) or the ad fails.
- MENU on the result screen asks for the `menu` interstitial; every 3rd RETRY for `replay`.
- Pausing sets `Time.timeScale = 0`. Ads hold the game themselves and restore it.
- Easy runs, `MinDurationMs`, time trials, the best and rounding are `AyvagoRun`'s job. Do not
  re-implement them.

## 5. Screens and layout (contract §5.1–§5.4)

- **Menu**, top to bottom:
  - the game's logo art with a small emblem;
  - `BEST: n`;
  - a big PLAY;
  - EASY / NORMAL beside PLAY in landscape, under it in portrait;
  - the HOW TO PLAY box;
  - the bottom row: the sound toggle bottom-left, the Ayvago Games logo (an image, never text)
    bottom-centre, and bottom-right the language toggle (standalone) or the trophy (embedded,
    `AyvagoSDK.Embedded`).
- **Two layouts.**
  - Build every screen for 1280×720 and for 720×1280: two prefabs, or anchors that truly work in
    both. Pick by `AyvagoDevice.IsLandscape`.
  - Check both in the Game view (16:9 and 9:16).
  - In a browser, `?orient=portrait` and `?orient=landscape` force one.
- **HUD.**
  - Every readout in an `AyvagoHudChip`, on the top row (`AyvagoHudChip.RowY`). Score from
    `AyvagoHudChip.Margin` on the left.
  - The right-most chip ends `AyvagoHudChip.RightEdge` px from the right edge, so the pause
    button keeps its place.
- **Touch** (`AyvagoDevice.Touch`, tablets included):
  - an on-screen stick or arrows on the left and action buttons on the right;
  - buttons at least 80 design px, about 70% opaque at rest;
  - never on desktops.
- **Key help** on desktops: `AyvagoKeyHelp.InMenu`, `ShowFirstPlay` and `PauseStrip` (§4
  above). Label keys are strings (`kh_…`) in both languages.

## 6. Text and fonts (contract §5.3)

- Every visible string goes through `AyvagoStrings.Register(key, en, tr)` and
  `AyvagoStrings.T(key)`. No literal UI text.
  - The core strings already exist: `play`, `retry`, `menu`, `resume`, `paused`, `best`,
    `newBest`, `howTo`, `diffEasy`, `diffNormal`, the `ad…` labels and the `kh_…` labels.
  - Use `AyvagoStrings.Upper` for capitals: in Turkish, i → İ.
- Redraw every text on `AyvagoStrings.LocaleChanged`.
- **Fonts:** make TextMeshPro font assets from `Packages/com.ayvago.sdk/Fonts/` into `Assets/Fonts/`.
  - Use Character Set "Characters from File" with `turkish-charset.txt`.
  - Modern style: Fredoka Bold for titles, with **Nunito Bold as its fallback** (Fredoka has no
    ğ Ğ İ ş Ş); Nunito ExtraBold for body text.
  - Retro style (retro genre only): AyvagoPixelTR as the title asset with Press Start 2P as its
    fallback; Pixelify Sans for body text.
  - Test the string "İĞŞÇÖÜ ığşçöü" on every screen.
- With TextMeshPro, set `AyvagoUI.CreateText`, `SetTextValue` and `AddOutline` once (the package
  README has the code), so key help and chips use the same fonts.

## 7. Audio (contract §5.5)

- **The sound buttons:** `AyvagoAudio.Toggle()`. Their icons follow `AyvagoAudio.Changed`.
  Never set `AudioListener.volume` yourself; use `AyvagoAudio.Volume` for a master level.
- **Music:** a title theme on the menu and a play track. Duck them under pause and the result
  screen.
- **Effects:** a sound for every action.
- **Autoplay:** audio starts after the first input (the intro's tap unlocks it).

## 8. Ads, theme, character (contract §5.8–§5.10)

- **Rewarded ads** only from result-screen buttons, and only while `AyvagoSDK.AdsAvailable`:
  - `AyvagoRun.Continue` for continue;
  - `AyvagoSDK.Rewarded("double", …)` for a currency double.
- **Interstitials:** `AyvagoSDK.Interstitial("menu" | "replay", next)`. Always continue in the
  callback.
- **Theme:** hide your scanline or CRT effect while `AyvagoSDK.HostScanlines`, and update on
  `AyvagoSDK.ThemeChanged`.
- **Character:** `AyvagoSDK.Character` picks the hero's model when the game has a human hero.
  Each move uses the model's own animation.

## 9. Test it in Unity

- **Play mode:** every platform call is logged as `[ayvago] …`.
- **Simulate the platform:** set `AyvagoSDK.EditorConfig` (embedded, adsEnabled, locale, best,
  phone, touch) from a `[RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]`
  method in a test script.
- **Commands:** `AyvagoTestHooks.Send("end", "100")` runs a test command, and
  `AyvagoTestHooks.LastJson` shows the published state.
- **Restart-safe:** five RETRYs must leave memory flat (the Profiler).

## 10. Definition of Done (contract §9)

- [ ] Boot → intro → menu.
- [ ] `?nointro`, `?lang=tr|en`, `?orient=portrait|landscape` and `?keyhelp` work.
- [ ] The menu, play, pause and result screens in both orientations and both languages: no
      overlap and no clipped Turkish.
- [ ] Every readout is in a chip, with the pause button top-right.
- [ ] Touch controls on touch devices only. Keyboard (WASD and arrows) and gamepad play the
      whole game.
- [ ] Key help in all three places on desktop.
- [ ] Rounds go through `AyvagoRun` (Begin, End once, Abandon, Continue). `Order` and
      `MinDurationMs` match `game.json`.
- [ ] Every screen change and score change is published. All the test commands work.
- [ ] One sound switch; music and effects.
- [ ] No ad buttons with ads off. The continue and the interstitials follow §8.
- [ ] Download under 25 MB; 30+ fps on a mid-range phone; memory flat over 5 retries.
- [ ] In the studio: the smoke test and the platform harness pass for the slug.

## 11. Deliver into the studio

The studio is a local clone of `selchook/ayvago-games` (ask the owner where it is). Then:

1. **Ayvago → Build WebGL…** (the owner runs it, or call
   `Ayvago.Editor.AyvagoBuildWindow.Build(studioPath, slug)` from an Editor script). It builds into
   `<studio>/public/games/<slug>/` and replaces only `index.html`, `Build/` and `TemplateData/`.
2. **In the studio**, write `games/<slug>/game.json` with `"engine": "unity"` and
   `games/<slug>/guide.json`. `npm run new-game -- <slug> "<Title>" --unity` scaffolds both.
   - `game.json` needs: `id` = slug, `title`, `description` and `howTo` in en + tr, `genres`,
     `orientation: "adaptive"`, `controls`, `version` (bump it on every change), `credits`,
     `platform.addedAt`, and `platform.scoring` when the defaults do not fit (contract §6.2).
   - `guide.json` is written from the real game (the studio's new-game skill §7i). The scaffold's
     TODOs must go.
3. **In the studio**, run each of these and fix what fails:
   ```bash
   node scripts/gen-registry.mjs && node scripts/gen-platform.mjs --live
   npm run test:unity
   node scripts/smoke-test.mjs --dev --serial <slug>
   node scripts/platform-harness.mjs --dev <slug>
   node scripts/gen-store-assets.mjs --dev <slug>
   npm run validate:platform
   ```
   Look at the store art in `public/games/<slug>/ayvago/` (cover, cards, icon, logos).
4. **Commit and open a pull request.** In the studio, make a branch (`unity-<slug>` or
   `unity-<slug>-<change>`) with the build, `game.json`, `guide.json`, `ayvago.json`, the store art
   and the regenerated `platform/` and `src/generated/` files. Open the pull request against
   `main`. Commit the Unity project's own changes in its own repository.
