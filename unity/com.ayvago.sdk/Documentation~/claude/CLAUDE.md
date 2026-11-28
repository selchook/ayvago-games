# Ayvago Unity game: working agreement for Claude

This Unity project is a game for [ayvago.com](https://ayvago.com), the Ayvago web game platform.
It is built for WebGL with the **Ayvago SDK** package (`com.ayvago.sdk`). It ships through the
studio repo `selchook/ayvago-games`, where the build, its metadata and its store art live.

- **How to build a game here:** the skill `.claude/skills/ayvago-unity-game/SKILL.md`. Use it
  for every feature, screen and fix.
- **The contract:** `.claude/skills/ayvago-unity-game/AYVAGO_UNITY_SDK.md`. It covers the
  protocol, the package API, the leaderboard rules, the house rules, the test hooks and the
  Definition of Done. Read it before you change game flow, scoring, ads, audio or text. The same
  file is in the package (`Documentation~/AYVAGO_UNITY_SDK.md`) and in the studio
  (`docs/unity/AYVAGO_UNITY_SDK.md`).
- **Language:** the owner may write in Turkish; answer in the owner's language. Everything
  committed is English: code, comments, identifiers, commit messages and docs. Every player-facing
  string exists in English and Turkish (correct ç ğ ı İ ö ş ü).

## Non-negotiables (short form; the contract has the detail)

- **Unity 2022.3 LTS or Unity 6, WebGL.**
  - Run Ayvago → Install WebGL Template and Ayvago → Apply Player Settings: template Ayvago,
    compression Disabled, threads off, run in background off, WebGL 2, linear colour.
  - First download under 25 MB (aim for 10–15 MB); 30+ fps on a mid-range phone.
- **The brand intro first.** The `Boot` scene holds `AyvagoBootIntro` and comes first in Build
  Settings, the game's scene right after it. Never change the intro's choreography.
- **Never talk to the platform except through the package.**
  - `AyvagoRun` handles rounds and scores, `AyvagoAudio` the sound, `AyvagoStrings` the text,
    `AyvagoSDK` ads and events.
  - No Firebase, no other SDKs (no analytics, no other ad networks, no CrazyGames).
  - No runtime network loads: everything ships inside the build.
- **Leaderboards** (`AyvagoRun`):
  - `Begin()` on PLAY and RETRY.
  - `End(score, won)` exactly once, on the result screen.
  - `Abandon()` for MENU or RETRY from pause.
  - `Continue()` for the rewarded continue.
  - Set `Order` and `MinDurationMs` to `game.json` `platform.scoring`.
  - Easy runs are practice.
- **Flow.** Menu (logo, BEST, PLAY, EASY / NORMAL, HOW TO PLAY, sound and the Ayvago Games logo)
  → play → result (score, best, NEW BEST, RETRY, MENU, the ad offer). The pause overlay has
  RESUME / RETRY / MENU, opened by Esc / P / Start / the pause button / GHA_PAUSE / a hidden tab.
- **Adaptive.** Landscape 1280×720 on desktops and tablets, portrait 720×1280 on phones
  (`AyvagoDevice`), decided once at boot. Every screen is laid out for both. Touch controls on
  every touch device.
- **TR and EN** through `AyvagoStrings`, re-rendered on `LocaleChanged`.
- **Fonts.** Modern style: Fredoka + Nunito (Fredoka lacks ğ Ğ İ ş Ş, so Nunito is its fallback).
  Retro genre: Press Start 2P (behind Ayvago Pixel TR) + Pixelify Sans. All are in the package's
  `Fonts/`.
- **HUD.** Every readout in a chip (`AyvagoHudChip`); the pause button top-right.
- **Key help** on desktop (`AyvagoKeyHelp`): in the menu's HOW TO PLAY box, on the first play, and
  in the pause strip.
- **One sound switch** (`AyvagoAudio`).
- **Music and effects:** the music ducks under pause and result; every action has a sound.
- **Ads.**
  - Rewarded ads only by the player's choice, on the result screen. Show no ad buttons while
    `AyvagoSDK.AdsAvailable` is false.
  - Interstitials only at natural breaks (result → menu, every 3rd retry).
- **The player's character** (`AyvagoSDK.Character`) picks the hero's model when the game has a
  human hero.
- **Test hooks are required.**
  - Publish every screen and score change (`AyvagoTestHooks.Publish`).
  - Handle `play`, `pause`, `resume`, `retry`, `menu`, `end [score]` and `continue`
    (`AyvagoTestHooks.Command`).
- **Assets.** CC0 (Kenney, Quaternius, the studio's `docs/assets/LICENSES.md`) or supplied by the
  owner. Asset Store assets only with the owner's approval. No CC-BY.
- **Original games only.** No religious structures, words or imagery.
- **Done means tested:** the studio's smoke test and platform harness pass for the slug, and
  the contract's Definition of Done holds.

## Delivering a build

1. **Ayvago → Build WebGL…** into a local clone of `selchook/ayvago-games`, at
   `public/games/<slug>/`. The menu remembers the studio path and the slug.
2. In the studio, write `games/<slug>/game.json` (with `"engine": "unity"`) and
   `games/<slug>/guide.json`. `npm run new-game -- <slug> "<Title>" --unity` scaffolds both.
3. In the studio, run:
   ```bash
   node scripts/gen-registry.mjs && node scripts/gen-platform.mjs --live
   npm run test:unity
   node scripts/smoke-test.mjs --dev --serial <slug>
   node scripts/platform-harness.mjs --dev <slug>
   node scripts/gen-store-assets.mjs --dev <slug>
   npm run validate:platform
   ```
4. Commit on a branch in the studio and open a pull request against `main`. Commit the Unity
   project's own changes in its own repository.
