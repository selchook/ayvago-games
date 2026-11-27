# Changelog

## 0.1.0 (2026-11-27)

The first version of the package, for platform protocol 2.8 (adapter 2.8.0).

- **Bridge.** `AyvagoSDK`:
  - the config: embedded, locale, ads, best, character, theme, touch, phone, orientation and the
    URL flags;
  - the events: pause, resume, mute, locale and theme;
  - the platform calls;
  - ads that hold the game while they run;
  - a logging stub in the Editor.
- **Runs.** `AyvagoRun` enforces the leaderboard rules: one GHA_SESSION_START and one GHA_END per
  run, the rewarded continue, the best score by order, Easy runs as practice, and
  `minDurationMs`.
- **Settings and text.** `AyvagoAudio` (the one sound switch), `AyvagoStrings` (TR/EN with the
  studio's core strings), `AyvagoDevice` (the phone and orientation rule) and `AyvagoDifficulty`.
- **UI.** `AyvagoKeyHelp` (menu, first play, pause strip) and `AyvagoHudChip` (frosted glass or
  retro box). Both are built from generated sprites.
- **Test hooks.** `AyvagoTestHooks`: the state and the commands.
- **Brand intro.** `AyvagoBootIntro`, owner-supplied. Since the original, it has:
  - the namespace `Ayvago`;
  - next-scene-by-build-index;
  - `?nointro`;
  - the intro test state;
  - both input backends.
- **WebGL.** The Ayvago WebGL template, with the adapter bundled from the studio.
- **Editor.** The Ayvago menu:
  - install the template;
  - apply the player settings;
  - build WebGL into the studio;
  - set up the Claude Code files.
- **Fonts.** Fredoka, Nunito, Press Start 2P, Pixelify Sans and Ayvago Pixel TR as TTF, with a
  Turkish character set for TextMeshPro.
