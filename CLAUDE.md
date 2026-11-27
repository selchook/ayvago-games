# Ayvago Games — game factory

HTML5 retro arcade / action / casual / puzzle games for the Ayvago platform.
Phaser 3.90 + TypeScript + Vite, one shared runtime, one folder per game.

**Role: the studio.** This repo makes the games. Players meet them on ayvago.com
(`selchook/ayvago`), which owns accounts, leaderboards, themes, the admin panel and online rooms.
Games never talk to Firebase; they speak the GHA protocol to the platform page around them.
Decision record: ADR 0011 in the platform repo.

## Layout

```
src/core/          shared runtime (@core): intro, launch, flow scenes, ArcadeScene, controls, i18n, sdk, fx, ui, steering (car games)
src/core/three/    3D runtime (@core/three): World3D, GLB models via the Phaser loader (3D games only)
src/core/three/city/  procedural city generator (opt-in, via @core/three): plan data, terrain, kit buildings, open-world data, chunk-streamed CityView with a day–night cycle; docs/city-generator.md
games/<slug>/      one game each: index.html, game.json, guide.json (the game page's written guide), main.ts, *.ts
templates/game/    scaffold used by `npm run new-game`
public/assets/     ayvago/ (boot intro PNGs, favicon, menu-logo.png: the menu's Ayvago Games logo) · kenney/<pack>/ (CC0 art + audio; car-kit, platformer-kit, nature-kit are GLB 3D kits) · quaternius/<pack>/ (CC0 GLB kits; downtown-megakit is the city generator's building kit) · thumbs/ (portal)
platform/          arcade-catalog.ts (generated SeedGame entries) + arcade-guides.json (generated game guides); the platform pulls both from main
wip/               unfinished games (not built)
docs/              GAMES.md (catalogue + backlog), assets/INDEX.md + assets/<pack>.txt (every file with px size), unity/AYVAGO_UNITY_SDK.md (the contract and bridge for Unity WebGL games)
portal/ index.html game launcher page (reads src/generated/registry.json)
scripts/           gen-registry, new-game, smoke-test (Playwright)
tools/city-preview/  dev page to look at generated cities (npm run dev → /tools/city-preview/; not built)
tools/             import-kenney.py (Kenney mirror), import-oga.py (CC0 audio from OpenGameArt), import-megakit.mjs (the city's building kit), index-3d.mjs (3D kit lists), build-menu-logo.py (menu logo from the intro PNGs)
.claude/           skills/ayvago-new-game (how to build a game), agents/ayvago-game-dev + ayvago-game-qa
```

## Commands

| | |
|---|---|
| `npm run dev` | dev server; portal at `/`, games at `/games/<slug>/` (`?nointro`, `?lang=tr|en`). In production the portal is an internal tool at `/portal/` and `/` redirects to ayvago.com |
| `npm run new-game -- <slug> "<Title>"` | scaffold a game |
| `npm run build` | registry + typecheck + production build into `dist/` |
| `npm run test:smoke` | full smoke test of every game against `dist/` |
| `npm run test:changed` | build + smoke + platform check of only the games a change can affect since `origin/main`: a game's own folder tests that game (its `guide.json` alone tests nothing); a changed asset tests the games that load it; character art or `characters.ts` tests the character games; other shared runtime (`src/core`, build config) tests the canary set, one game per runtime variant (plus every adaptive game when the file has orientation code: `isLandscape`, `gameOrientation`, `isPhone`); a dependency upgrade tests all. Rules in `scripts/changed-games.mjs`. CI runs the same on pull requests, only builds on `main` (the pull request already tested it) and runs every game nightly and on demand (Actions → ci → Run workflow) |
| `node scripts/smoke-test.mjs --dev --serial <slug>` | smoke-test one game without building (an adaptive game runs twice: desktop landscape and an emulated phone in portrait; `--tablet` adds an iPad, which must get landscape) |
| `npm run test:platform` | GHA protocol check of every game embedded like ayvago.com |
| `npm run test:three-memory` | GPU memory check of the 3D games: three.js textures and geometries must stay flat across restarts of the Play scene (`World3D` frees what it created) |
| `npm run platform` | regenerate ayvago.json manifests + `platform/arcade-catalog.ts` + `platform/arcade-guides.json` |
| `npm run store-assets` | regenerate platform covers, icons, screenshots, catalog cards (EN + TR; adaptive games also portrait cards), logos + portal thumbnails (`-- --card-only <slug ...>` redoes just the cards, `-- --logo-only` just the logos) |
| `npm run release` | build + smoke + platform checks + manifests + art |

## Non-negotiables

- **Ayvago intro on every game.** `src/core/intro.ts` is a 1:1 port of the Unity `AyvagoBootIntro.cs`: 5.3 s, skippable by tap. It runs automatically from `launch()` while the game preloads. Don't change its choreography without the brand owner. The menu's bottom row carries the same lockup as a logo (`public/assets/ayvago/menu-logo.png`, built from the intro PNGs by `tools/build-menu-logo.py`); never draw the brand as text.
- **Mobile and desktop.** Every game supports touch and keyboard. New games are **adaptive** (`"orientation": "adaptive"`): landscape 1280×720 on desktops and tablets, portrait 720×1280 on phones (`isPhone()` in `src/core/registry.ts`: no hover, a coarse pointer and a screen under 600 px on its short side; the platform uses the same rule), decided once at boot, `?orient=portrait|landscape` to force one. Every screen is laid out for both (new-game skill §7j); touch controls show on any touch device, tablets in landscape included. A fixed `portrait` or `landscape` only when a game truly cannot work in the other shape.
- **HUD chips.** Every always-visible HUD readout sits in its own chip (`src/core/ui.ts`): iOS-style frosted glass in the modern style, a plain bordered box in retro. `Hud` draws score, lives, level and the centre/right slots that way; game-specific readouts use `hudChip()`. No bare floating HUD text (new-game skill §4).
- **TR and EN.** Every user-visible string is in both languages; the Turkish must be correct (ç ğ ı İ ö ş ü). Fonts: retro-genre games use Press Start 2P (titles) + Pixelify Sans (body); every other game is drawn in the modern style (`src/core/style.ts`: Fredoka + Nunito, smooth scaling, rounded UI, no scanlines). All four fonts cover Turkish; the core puts "Ayvago Pixel TR" (`src/core/turkish-font.ts`: İ, Ö and Ü) in front of Press Start 2P because its own İ, Ö and Ü look like lowercase i, ö and ü. The Kenney fonts do not cover Turkish.
- **Assets.** CC0 only, from `public/assets`: Kenney (`kenney/`) and the CC0 packs recorded in `docs/assets/LICENSES.md` (`oga/`: Juhani Junkala's 512 retro effects and chiptune music). A new pack is added to that register (source, author, license) before it is used; CC-BY and other attribution licenses are not allowed. No runtime network loads.
- **3D games.** three.js through `@core/three` (never `@core`), Kenney GLB kits, everything else as in a 2D game. Pilot: `games/sky-road`; rules in the new-game skill (§7b). People in 3D are rigged Kenney Mini Characters; the player's platform character maps to its 3D model through `loadCharacter3d()` / `playerCharacter3d()` (reference `games/golden-podium`).
- **Driving games.** Every car / truck / kart game steers through the shared `@core` car steering (`src/core/steering`): `menuOption: steeringOption` (ARROWS | WHEEL | TILT on touch screens, one choice for all car games), a `CarSteering` pad with the game's own right-thumb buttons, and ←/→ on the keyboard. Rules and tests: new-game skill §7d; references `games/mud-rally`, `games/sky-road`.
- **Music.** The core plays background music (`src/core/music.ts`): the title theme on the menu and a track picked from the game's genre during rounds, ducked under pause and result screens. A game may choose with `music: { menu, play }` in its definition (`false` turns a slot off).
- **Player characters.** Players pick one of five human characters on ayvago.com; the platform sends it in GHA_START (protocol 2.2).
  - Games with a hero whose art fits the Kenney vector style use it through `loadCharacter()` / `playerCharacter()` in `src/core/characters.ts`. The art is in `public/assets/characters` (31 poses each, built by `tools/import-characters.py`; the walking-up/down and kick-from-behind poses are derived there from `front`/`back`).
  - Every move uses the character's own pose (`kick`, `hang`, `cheer1` ...); never draw extra limbs on top of a character.
  - The five ids are the contract with the platform's `packages/shared`.
- **Done means tested.** A game is done when the smoke test passes and it meets the Definition of Done in `.claude/skills/ayvago-new-game/SKILL.md`.

## Ayvago platform integration (selchook/ayvago)

- **Protocol.** Games run on ayvago.com inside a sandboxed iframe and speak the platform's GHA_* protocol (SDK v2). The protocol comes through the official adapter, vendored verbatim at `src/core/ayvago/adapter.ts`. Never edit it here; copy a new version from `packages/platform-adapter` in the platform repo.
- **Wiring in `src/core/sdk.ts`.** All of this is automatic for every game, so games never talk to the platform themselves:
  - `launch()` performs the handshake (GHA_READY → GHA_START) and adopts the platform locale.
  - Boot reports GHA_LOADING.
  - Every round sends GHA_SESSION_START.
  - The result screen sends GHA_END `{score, won}` and `celebrate()` on a new best.
  - GHA_PAUSE opens the pause overlay, and GHA_LOCALE_CHANGE re-renders the menu.
  - One sound switch (protocol 2.5): the platform's toolbar button (GHA_MUTE) and the game's own sound buttons set the same switch; the game reports its state with GHA_MUTE_STATE after the handshake and on every change (`setMuted` / `onMuteChange` in `src/core/audio.ts`).
  - Under the platform's retro and arcade themes (in GHA_START or GHA_THEME_CHANGE) the page draws its own CRT scanlines over the frame, so the game hides its scanlines (`setHostScanlines` in `src/core/fx.ts`).
  - The menu shows the platform leaderboard button.
  - Gamepad: `launch()` starts `src/core/gamepad.ts`, which turns a standard pad into the keys games already read (A Space / Enter, B X / Escape, Start pauses; table and `gamepad` override in new-game skill §7h; `npm run test:gamepad`).
  - Ads (`src/core/ads.ts`, new-game skill §7e): only through `adsAvailable()` / `showRewarded()` / `showInterstitial()`. Rewarded ads are always the player's choice on the result screen (opt-in `ads: { continue, double }`), never during play or online, and hidden while the platform sends `adsEnabled: false`. A continued run sends one GHA_END, with `continues: 1` once the vendored adapter forwards the field; the core asks for interstitials at natural breaks only.
  - GHA_START `best` (protocol 2.4) is the player's record on ayvago.com; it replaces the browser's stored best, so "NEW BEST" matches the platform on every device (`adoptPlatformBest` in `src/core/storage.ts`).
- **Platform id.** The slug without hyphens (`space-blaster` → `spaceblaster`), because the manifest id must match `[a-z0-9]{3,32}`.
- **Per-game platform files.** Generated by `npm run platform` (`scripts/gen-platform.mjs`), which writes:
  - `public/games/<slug>/ayvago.json`
  - `platform/arcade-catalog.ts`: the SeedGame entries. The platform's "Sync arcade catalog" workflow pulls this file from `main` (hourly or on demand) into `packages/shared/src/arcade-catalog.ts` and opens a PR, so it is never copied by hand. CI fails when the committed file is stale (`node scripts/gen-platform.mjs --live`).
  - `platform/arcade-guides.json`: every game's written guide (`games/<slug>/guide.json`: about, how to play, controls, tips, features, FAQ in English and Turkish; schema `scripts/vendor/guide.ts`, the platform's contract), synced the same way and rendered as the text of the game page. Required for new games; how to write one and what `npm run validate:platform` checks: new-game skill §7i.
  - `genres` become the platform categories (first genre = primary category; the game is listed under all of them). Optional overrides in `game.json` under `platform: { ageRating, scoring, featured, addedAt }` (`featured` puts the game in the ayvago.com home spotlight; `addedAt` is the date the game joined the catalog, written by `new-game`, and drives the platform's New shelf and badge).
- **Store art.** `npm run store-assets` (`scripts/gen-store-assets.mjs`) captures each game's menu and a few seconds of play and writes into `public/games/<slug>/ayvago/`:
  - `cover-1920x1080.jpg`: the branded banner (title, description, phone mock-ups) for the game page; an adaptive game's shows its landscape frame beside a phone in portrait (captured with `?orient=`), and its card, screenshot and icon come from the landscape run (the card cover-fit like a landscape game's), its portrait card from the phone run;
  - `icon-512.png` and `screenshot.jpg` (in-game frame for the platform's Arcade theme tiles);
  - `card-640x360.webp` + `card-1280x720.webp`, and the Turkish `card-tr-640x360.webp` + `card-tr-1280x720.webp` (manifest `assets.card` / `card2x: { en, tr }`, ayvago.com shows the player's language): the catalog tile of the Minimal and Modern themes, the same frame in both languages with only the logo in that language. The liveliest frame of the run, cover-fit for landscape games, a sharp portrait frame on a blurred copy of itself for portrait games, with only a small logo (the English title in the game's font) bottom-left, clear of the platform's top-left badges; ~25–45 KB and ~60–110 KB. A per-game `CARD` table in the script picks another frame or logo colour when the default misses the action, or stages the scene the card should show through the game's own test hooks (`stage`, e.g. Crystal Keep's card draft);
  - adaptive games only: `card-portrait-360x640.webp` + `card-portrait-720x1280.webp`, and the Turkish `card-portrait-tr-360x640.webp` + `card-portrait-tr-720x1280.webp` (manifest `assets.cardPortrait` / `cardPortrait2x: { en, tr }`): the tile ayvago.com shows on phones, where the game plays in portrait; the liveliest frame of the phone run (`?orient=portrait`) filling the card, the same small logo at the bottom, centred over a soft scrim; ~25–60 KB and ~60–140 KB (desktops and tablets keep the landscape card). A fixed-orientation game has none;
  - `logo-en.png` + `logo-tr.png` (manifest `assets.logo: { en, tr }`): the game's title art in each language on a transparent background, trimmed, at most 640×320 and 60 KB (palette PNG), which the platform draws over a screenshot on the game page before Play. A game with a menu theme gets its themed logo (the game's own `menuLogo`, emblem included); any other game the card's plain title logo;
  - and the portal thumbnail `public/thumbs/<slug>.png`.

  `--card-only` regenerates just the cards (both languages, an adaptive game's portrait cards included), `--tr-from-en` just the Turkish cards of portrait games from their current English cards (which stay as they are) and `--logo-only` just the logos (a plain logo takes its colour from the current card); both leave the other files untouched. `npm run validate:platform` checks every file exists at its size.
- **Platform harness.** `npm run test:platform` embeds every game cross-origin from `http://localhost:3000` and checks the full GHA flow.
- **Deployment.** One Vercel project serves everything: `vercel.json` sets `frame-ancestors` for ayvago.com and `Cross-Origin-Resource-Policy: cross-origin`. Each game's entry is `https://<origin>/games/<slug>/`; the default origin is `https://ayvago-games-nine.vercel.app` (the Vercel project under the ayvagogames account). Pass `--origin` to `gen-platform.mjs` if the domain differs.
- **Release.** `npm run release` builds, tests (smoke + platform) and regenerates manifests and art.
- **Adapter.** CI compares `src/core/ayvago/adapter.ts` with the platform's `packages/platform-adapter/src/adapter.ts` on `main` and fails when they differ: copy the platform's file over verbatim.

## Adding games at scale

1. Add the concepts to `docs/GAMES.md`.
2. Spawn one `ayvago-game-dev` agent per 4–6 games. Each owns only its `games/<slug>` folders.
3. Run `ayvago-game-qa` over the results.
4. Test only what changed: `npm run test:changed` (build, smoke and platform check of the new or changed games), then `node scripts/gen-platform.mjs --live`, `node scripts/gen-store-assets.mjs <new slugs>` and `npm run validate:platform`. `npm run release` tests every game; the nightly CI run does the same.
5. Merge to `main`. Vercel deploys the games; the platform's catalog sync then opens its PR (run "Sync arcade catalog" from the platform's Actions tab to do it at once).
6. Open every pull request against `main`. Stacked pull requests (one based on another's branch) merge into that branch, not `main`, once the first is merged.
