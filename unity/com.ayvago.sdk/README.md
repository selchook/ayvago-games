# Ayvago SDK for Unity (`com.ayvago.sdk`)

Everything a Unity WebGL game needs to run on [ayvago.com](https://ayvago.com):

- **`AyvagoSDK`**: the platform bridge (GHA protocol 2.8, through the official adapter in the WebGL template);
- **`AyvagoRun`**: the leaderboard rules: one session and one end per round, the continue, the best score;
- **`AyvagoAudio`**: the one sound switch shared with the platform's sound button;
- **`AyvagoStrings`**: the TR/EN string table, live language changes;
- **`AyvagoDevice`**: the phone, touch and orientation rule;
- **`AyvagoDifficulty`**: EASY / NORMAL, remembered;
- **`AyvagoKeyHelp`** and **`AyvagoHudChip`**: key caps and HUD chips, built at runtime;
- **`AyvagoBootIntro`**: the Ayvago brand intro;
- **`AyvagoTestHooks`**: the hooks the studio's tests and store art drive the game with;
- the **Ayvago WebGL template**, the **house fonts** and an **Ayvago menu** that builds into the studio.

The contract behind all of it is `Documentation~/AYVAGO_UNITY_SDK.md`, the same file as
`docs/unity/AYVAGO_UNITY_SDK.md` in [selchook/ayvago-games](https://github.com/selchook/ayvago-games).

Unity 2022.3 LTS or Unity 6, WebGL. The package depends only on uGUI. It works with the legacy
Input Manager and with the Input System package.

## Install

Package Manager → **+** → **Add package from git URL…**:

```
https://github.com/selchook/ayvago-games.git?path=/unity/com.ayvago.sdk
```

Append `#<commit or tag>` to pin a version. Updating the package brings every fix to the game.

## Set up a game

1. **Ayvago → Set Up Claude Code Files.** This writes `CLAUDE.md` to the project root (or
   `CLAUDE.ayvago.md` when the project already has one) and the skill
   `.claude/skills/ayvago-unity-game/` (with a copy of the SDK contract). Claude Code then knows the
   house rules and how to build and deliver an Ayvago game.
2. **Ayvago → Install WebGL Template**, then **Ayvago → Apply Player Settings**. The settings are:
   - template Ayvago;
   - compression Disabled, no decompression fallback, data caching on;
   - threads off, run in background off, explicitly thrown exceptions only;
   - WebGL 2, linear colour space, stripping High.
3. **The Boot scene.** Make a scene `Boot` with an empty GameObject and the `AyvagoBootIntro`
   component. Put it first in Build Settings and the game's first scene right after it. The intro
   loads the next scene by itself; `?nointro` skips it.
4. **Fonts.** Make TextMeshPro font assets from `Packages/Ayvago SDK/Fonts` into your own
   `Assets/` (see [Fonts](#fonts)).
5. **Build: Ayvago → Build WebGL…** Pick the folder of your `ayvago-games` checkout and the game's
   slug. The build goes to `public/games/<slug>/`, replacing only `index.html`, `Build/` and
   `TemplateData/` there.

The `AyvagoSDK` object creates itself before the first scene. Nothing has to be placed in a scene.

## Use it

```csharp
using Ayvago;

// at boot: the game's design and its platform.scoring from game.json
AyvagoDevice.Decide(OrientationSetting.Adaptive);        // landscape 1280×720, portrait 720×1280 on phones
AyvagoDevice.Configure(canvasScaler);
AyvagoRun.Order = ScoreOrder.Desc;                       // platform.scoring.order
AyvagoRun.MinDurationMs = 3000;                          // platform.scoring.minDurationMs
AyvagoRun.OffersContinue = true;                         // if the result screen offers the rewarded continue
AyvagoDifficulty.Offered = true;                         // if the menu has EASY / NORMAL
AyvagoStrings.Register("kh_jump", "Jump", "Zıpla");
AyvagoKeyHelp.SetRows(new AyvagoKeyRow("kh_move", "A D", "Left Right"),
                      new AyvagoKeyRow("kh_jump", "Space"),
                      new AyvagoKeyRow("kh_pause", "Esc"));

// PLAY and RETRY
AyvagoRun.Begin();                                       // GHA_SESSION_START

// the result screen: exactly once per round
if (AyvagoRun.CanContinue) { /* show CONTINUE; call End when the player declines */ }
var r = AyvagoRun.End(score, won);                       // GHA_END (+ GHA_HAPPY_TIME on a new best)
bestText.text = AyvagoRun.Best.ToString();
newBestRibbon.SetActive(r.NewBest);

// CONTINUE pressed
AyvagoRun.Continue(ok => { if (ok) ResumeWithOneLife(); else ShowResult(AyvagoRun.End(score, false)); });

// MENU or RETRY from the pause overlay
AyvagoRun.Abandon();                                     // GHA_GAMEPLAY_STOP, never an END

// platform events
AyvagoSDK.Paused += OpenPauseOverlay;                    // GHA_PAUSE or a hidden tab
AyvagoStrings.LocaleChanged += _ => RedrawTexts();
AyvagoAudio.Changed += muted => soundIcon.sprite = muted ? off : on;
soundButton.onClick.AddListener(AyvagoAudio.Toggle);    // the one sound switch

// test hooks: publish every screen change and score change, handle the commands
AyvagoTestHooks.Publish(AyvagoScreen.Play, score, level);
AyvagoTestHooks.Command += (name, arg) => { /* play, pause, resume, retry, menu, end, continue, stage */ };
```

- **Leaderboard rules.** `AyvagoRun` enforces them, so the game cannot get them wrong:
  - One `End` per run; a second call is ignored.
  - Easy runs are practice: they never set a best.
  - The platform's best replaces the local one.
  - Scores are sent as whole numbers, never below 0.
  - A time trial (`ScoreOrder.Asc`) that was not won is sent without a score.
  - A run shorter than `MinDurationMs` that was not won sends no `GHA_END`.
- **Ads.** Use `AyvagoSDK.Rewarded("continue" | "double", done)` and
  `AyvagoSDK.Interstitial("menu" | "replay", done)`.
  - Rewarded ads only from a button on the result screen.
  - While an ad runs the game is held (`Time.timeScale = 0`, `AudioListener.pause`), then restored.
  - When ads are off, `AyvagoSDK.AdsAvailable` is false: show no ad buttons.
- **Theme.** When `AyvagoSDK.HostScanlines` is true, hide the game's own scanlines.
  `AyvagoSDK.ThemeChanged` fires when it changes.
- **Character.** `AyvagoSDK.Character` is the player's chosen character id.

## Key help and HUD chips

```csharp
AyvagoUI.Retro = false;                              // true for retro-genre games
AyvagoUI.BodyFont = nunitoExtraBold; AyvagoUI.TitleFont = fredokaBold;   // legacy Font assets from Fonts/

AyvagoKeyHelp.InMenu(howToBox, howToBodyColour);     // 1. the menu's HOW TO PLAY box (null on touch: show the text)
var hint = AyvagoKeyHelp.ShowFirstPlay(playRoot);    // 2. the first round on this browser, fades after 10 s of play
AyvagoKeyHelp.PauseStrip(pauseRoot);                 // 3. the pause overlay's strip

var scoreChip = AyvagoHudChip.Create(hudRoot, AyvagoHudChip.Align.Left, AyvagoHudChip.Margin, AyvagoHudChip.RowY, AyvagoStrings.T("score"), "0");
scoreChip.SetText(score.ToString());
```

The caps, chips and rounded bands are generated sprites; no editor-made assets are involved.

### Using TextMeshPro

By default the package builds UGUI `Text`. A TextMeshPro game sets the factory once:

```csharp
AyvagoUI.CreateText = (parent, text, size, color, title) => {
    var t = parent.gameObject.AddComponent<TextMeshProUGUI>();
    t.font = title ? titleFontAsset : bodyFontAsset;
    t.fontSize = size; t.color = color; t.text = text;
    t.alignment = TextAlignmentOptions.Center; t.enableWordWrapping = false;
    return t;
};
AyvagoUI.SetTextValue = (g, s) => ((TMP_Text)g).text = s;
AyvagoUI.AddOutline = g => { var t = (TMP_Text)g; t.outlineWidth = 0.25f; t.outlineColor = new Color32(10, 14, 28, 255); };
```

## Fonts

`Fonts/` holds the four house fonts as full TrueType files with Latin Extended, so Turkish works.
They are licensed under the SIL OFL 1.1 (`Fonts/OFL.txt`).

| Style | Titles | Body |
|---|---|---|
| modern (most games) | `Fredoka-Bold.ttf` (or `-SemiBold`) | `Nunito-ExtraBold.ttf` (or `-Bold`) |
| retro (retro genre) | `PressStart2P-Regular.ttf` behind `AyvagoPixelTR.ttf` | `PixelifySans-Regular.ttf` / `-Bold` |

- **Fredoka has no ğ, Ğ, İ, ş or Ş.** This is true upstream and in the studio's web fonts. Its
  `.meta` names Nunito Bold as the fallback for legacy `Font`. In TextMeshPro, add the Nunito font
  asset to the Fredoka asset's **Fallback Font Assets**.
- **Press Start 2P draws İ, Ö and Ü like lowercase letters.** `AyvagoPixelTR.ttf` has proper
  full-height İ, Ö and Ü and nothing else. Make it the primary TMP font asset of retro titles and
  put Press Start 2P in its fallback list. Its legacy `Font` already falls back to Press Start 2P.
- **TextMeshPro font assets.** Window → TextMeshPro → Font Asset Creator:
  - Source: the TTF.
  - Atlas Resolution: 1024 (Press Start 2P: 512, Render Mode Raster).
  - Character Set: **Characters from File**, `Fonts/turkish-charset.txt`.
  - Save it into `Assets/` (the package folder is read-only).
  - Check İ, ı, ş and ğ in a test string.

## In the Editor and in other players

Every platform call is logged as `[ayvago] …` and nothing else happens. The run is standalone:
no ads, and the system language. To simulate the platform, set `AyvagoSDK.EditorConfig` before
the first scene loads (embedded, locale, adsEnabled, best, phone, touch …). The ad stub answers at
once with "not rewarded". `AyvagoTestHooks.Send("end", "100")` runs a test command.

## The test hooks

`window.__ayvago` in the page gives `state()` (the last `AyvagoTestHooks.Publish`, plus the SDK's
own fields) and `command(name, arg)`. The studio's smoke test, platform harness and store-art
capture drive a Unity game only through them, so every game must:

- publish `intro`, `menu`, `play`, `pause` and `result`, with its score;
- handle `play`, `pause`, `resume`, `retry`, `menu`, `end [score]` and `continue`. `stage <name>`
  is optional.

The SDK handles `sound`, `difficulty easy|normal` and `locale en|tr` itself. See §8 of the SDK
contract.
