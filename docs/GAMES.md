# Ayvago launch catalogue

## Status (92 shipped)

**Shipped.** 92 games (Color Race was retired on 2026-11-06). Every one passes the smoke test, the GHA protocol test and manifest validation, and is in the platform catalog:
air-hockey, alien-invaders, archery, asteroid-storm, axe-throw, backgammon, block-blast, block-drop, bomb-maze, bowling-strike, brick-breaker, bubble-pop, bug-blaster, cave-copter, city-defender, coin-catcher, color-bounce, color-gate, color-road, color-wheel, connect-four, crystal-keep, dots-and-boxes, dungeon-dash, fish-frenzy, fruit-slash, gem-match, golden-podium, gomoku, head-soccer, hex-bridge, hex-merge, hoop-shot, jetpack-rush, letter-loop, letter-rain, light-cycles, lights-out, lunar-lander, mangala, marble-maze, maze-muncher, memory-match, merge-2048, mine-sweeper, mini-golf, mud-rally, neon-pong, nine-mens-morris, nonogram, okey, orbit-hop, paint-roll, penalty-kick, pinball, pipe-flow, pirate-cove, pixel-runner, platform-hopper, plinko-drop, putt-park, retro-snake, reversi, road-crosser, rope-swing, sea-battle, secret-word, shooting-gallery, simon-says, sky-jumper, sky-road, slide-puzzle, sokoban, solitaire, space-blaster, stack-tower, strike-alley, sudoku, sumo-push, tank-arena, tappy-plane, tile-triple, tito-tank, tower-defense, traffic-racer, turkish-draughts, ufo-abduction, ultimate-tictactoe, water-sort, whack-a-mole, word-hunt, zombie-survivor.

- **Launch wave (2026-10-27):** 26 games.
- **Second wave (2026-10-28):** 28 games. These are the former backlog plus dungeon-dash and nonogram, finished from `wip/`. Each carries `platform.addedAt` in its `game.json`.
- **Third wave (2026-10-29):** 10 games, batches J and K. The five in batch J (gomoku, dots-and-boxes, sea-battle, turkish-draughts, light-cycles) are playable online by two players (`"multiplayer": true`), bringing the online games to 13.
- **Fourth wave (2026-10-30):** 6 games, batches L and M. The three in batch L (mangala, backgammon, head-soccer) are playable online, bringing the online games to 16. head-soccer and rope-swing use the player's platform character.
- **Fifth wave (2026-11-04):** 10 games, batches N and O. The five in batch N (color-race, ultimate-tictactoe, hex-bridge, nine-mens-morris, sumo-push) are playable online, bringing the online games to 21. Batch O adds one-touch colour games in the spirit of Color Gate.
- **Tito's Tank (2026-11-05):** an artillery duel rebuilt from the owner's own game (`selchook/tito-multiplayer`), against the computer or online, bringing the online games to 22.
- **Okey (2026-11-06):** classic Turkish Okey, the first table game: on your own against three bots, or online at a table of up to four (protocol 2.3, `"multiplayer": 4` in `game.json`) where the host fills the empty seats with bots. Rules in `games/okey/logic.ts`; the host plays the bots and the seats of players who drop out, and a player who comes back gets the hand so far from the host.
- **Letter Loop / Harf Çemberi (2026-11-07):** a letter-wheel crossword. Swipe across the wheel letters to spell words that fill the grid before the clock runs out; other valid words are bonus words (every five earn a hint). Levels are generated from word lists written for the game (`src/words/tr.ts`, `en.ts`, shared with Letter Rain: about 3,800 Turkish and 7,400 English answer words plus bonus-only extras), in the platform's language. Check the lists with `node scripts/check-letter-loop-words.mjs tr|en`. Typing works too; on a keyboard without Turkish letters, S also types Ş, C types Ç and so on.
- **Letter Rain / Harf Yağmuru (2026-11-07):** a falling-letter word game on a 7×9 board. Letters rain in one by one over a marked column; drag across neighbouring tiles (or tap them and press SEND, or type) to spell words of 3+ letters that pop off the board. Score is the letter values (1–8, by frequency) times a length multiplier, with combos for quick words. Gold tiles double a word, bombs clear their neighbours, cracked tiles harden into stone that only a word next to it breaks. Every few words the level rises and the rain speeds up; the round ends when a tile falls into a full column. Shuffle and hint helpers (long words earn hints). Uses the Letter Loop word lists, now shared in `src/words/`.
- **Sky Road / Gök Yolu (2026-11-07):** the first 3D game and the pilot for `@core/three`. A car races along a road of floating blocks above the clouds: steer between three lanes, jump gaps, dodge crates and spikes, collect coins and hearts; speed and level rise every 250 m. On touch screens it uses the shared car steering (arrows, an on-screen wheel or tilt, chosen on the menu) with a big JUMP button. Built from the Kenney Car Kit and Platformer Kit (GLB), drawn by three.js under the usual Phaser HUD and menus.
- **Mud Rally / Çamur Rallisi (2026-11-07):** the second 3D game, a single-screen off-road truck championship (landscape). Four lifted trucks race four laps of a dirt arena seen whole from one high camera, over humps and jump ramps, through mud pits and puddles; the trucks steer like real cars, relative to their own heading (left / right turn, gas, brake and reverse; on touch the shared car steering of `src/core/steering`, arrows, an on-screen wheel or tilt chosen on the menu, plus GAS / BRAKE / NITRO pedals), with power slides and tyre marks on the dirt. Prize money and track pickups are the score; between races the garage sells engine, tires, shocks and nitro upgrades, the six arenas cycle and the rivals get faster. Finishing 4th costs one of three lives (four in Easy, where the rivals are slower, rubber-band less, rarely use nitro and the mud holds the player's truck less). The ground is a vertex-coloured height grid built per track (`games/mud-rally/terrain.ts`); trucks from the Car Kit, dressing from the Racing, Nature and Platformer kits.
- **Car steering pass (2026-11-09):** every driving game steers through the shared car steering, now calmer: the on-screen wheel needs 155° for full lock (was 100°), tilt 34° (was 24°; Sky Road 26°, was 18°), both with a gentle centre curve (steering = input^1.35), and keys and arrows take 0.4 s to full lock (was 0.18 s; Sky Road 0.22 s, Traffic Racer 0.25 s, were instant). Mud Rally gets Easy / Normal next to its steering switch (the core menu now stacks the two). **Traffic Racer** moves from the joystick to the car steering, with BOOST (double points, thirstier) and BRAKE pedals (↑ / Space and ↓ on the keyboard), Easy / Normal, tyre marks, brake lights, boost flame and wind streaks, crash smoke, a red low-fuel screen edge, a combo label and an engine sound that follows the speed.
- **Secret Word / Gizli Kelime (2026-11-08):** an arcade hidden-word game. Guess the secret word in six tries; after each guess every letter turns green (right place), amber (in the word elsewhere) or grey (not in it), with repeated letters marked by the standard two-pass rule. Words come one after another against a clock (120 s, 4 s less per word in the streak, never under 60 s): 4 letters for words 1–3, 5 letters from word 4, 6 letters from word 10. A solve scores 100 + 50 per unused try + 1 per second left, times a streak multiplier (+0.25 per word in a row, up to ×3); a missed word (six wrong guesses or time up) shows the answer and costs one of three lives. Jokers (one at the start, one more every three solves, up to three) reveal a letter in its place or drop five letters that are not in the word. Answers are clean everyday words from the shared `src/words/` lists (inflected forms filtered out in `games/secret-word/logic.ts`); any listed word of the right length is a valid guess. Turkish Q keyboard on screen; on a keyboard without Turkish letters, KOSE is read as KÖŞE.

- **Golden Podium / Altın Kürsü (2026-11-09):** the third 3D game, a five-event athletics cup (landscape) inspired by the multi-event sports games of the 1980s but entirely its own: the fictional Ayvago Cup with four team colours (Coral, Teal, Sunny, Violet). The player's platform character and three rivals (the other characters) are camera-facing sprites in a 3D stadium, every move one of the character's own poses (walk1/walk2 running, jump/fall, duck at the start and in the sand, swim1/swim2 laid flat in the water, hold1 with a bow in the hand, cheer1/cheer2 on the podium). Events in order: 100 m sprint (LEFT / RIGHT in turn after the gun; the useful tap rate is capped and an even rhythm adds a little; the same side twice stumbles; false starts warn, then disqualify), 100 m hurdles (RUN in rhythm, JUMP timed before ten hurdles; a knocked hurdle costs speed), long jump (run-up, take-off at the board, hold JUMP to raise the angle and let go near 45°, three jumps, slow-motion flight), 50 m freestyle (STROKE on a closing beat ring, BREATHE when the air runs low; off-beat or doubled strokes lose speed) and archery (six arrows at 50 m through a zoomed sight that sways; the wind carries the arrow one ring per wind point). Each event scores points on a fixed curve plus medal (200 / 120 / 60) and cup-record (150) bonuses; results go up on a jumbotron board, then the medal table and a podium ceremony with confetti. Score = total points. Easy: lower useful tap rates, wider timing windows, a lit take-off zone and hurdle, a wind marker in archery and weaker rivals. Stadium, pool and range are built from shapes and canvas textures (track, lanes, stands with an instanced crowd, a wavy pool surface, target faces) dressed with the Racing and Nature kits; the crowd's murmur and roar are synthesised from filtered noise at start-up.

- **Marble Maze / Bilye Labirenti (2026-11-10):** the fourth 3D game, a tilt-maze (portrait). The player tilts a board to roll a glass marble from the start to the flag without dropping it into holes or off the edge; the board visibly tilts with the input and the marble rolls with momentum, rolling friction, a little bounce off walls and a pull at hole rims (`games/marble-maze/sim.ts`, a pure simulation shared with a level bot). 24 handcrafted levels in four worlds of six (Wood Workshop, Lily Garden, Ice Cave, Sky Ruins) bring one idea at a time: walls and holes, plank bridges, checkpoints, bumpers, jump pads, moving rafts and floating stones (they rest at each end), colour-coded buttons that open gates, ice and snow, sand, and keys that unlock the goal. Each level has optional gems; stars for finishing, all gems and the star time, shown on a level-select grid with locked levels (progress in the core storage). A run starts on the level select: every level played adds its best score of the run (stars, gems, time bonus, level number), a fall costs one of five marbles (a three-star level gives one back), the run ends when the marbles run out, after the last level or with FINISH on the level select. Controls: keys, the standard floating stick, or the phone's tilt (both axes, calibrated at every level start and with a CENTRE button; the menu switch CONTROL: STICK | TILT asks for the sensors from the tap, iOS style). Easy: slower and softer marble, smaller hole pull, a few holes filled in, grippier ice, eight marbles, star times ×1.35. Board and pieces are merged procedural meshes with canvas textures; gems, keys, flags and scenery come from the Kenney Platformer and Nature kits; the rolling rumble is synthesised from noise at start-up.
- **Putt Park / Golf Parkı (2026-11-10):** the fifth 3D game, mini golf built from the Kenney Minigolf Kit (portrait). 18 handcrafted holes in two nine-hole courses, a sunny Meadow course and an evening Castle course, each hole adding one idea: banks, bumps, ramps and raised greens, an island green over water, banked bends, a ramp jump over a gap, windmill sails, the castle gate, twin tunnels, a moat jump, sliding gates, a sweeping arm, obstacles and a closing hole that has a bit of everything. The ball rolls on a 1 cm field rasterised from the kit's own triangles (slopes push it, walls bounce it, it flies off ramps, a fast ball lips out of the cup, water and out of bounds cost a stroke). Drag back from the ball and let go (power by pull length), or ←/→ aim, ↑/↓ power, Space to putt; drag empty space or Q/E to turn the camera, pinch or Z/X to zoom, the eye button for the overview. Score is points per hole from strokes against par (hole in one 300 … bogey 60) over a 9- or 18-hole round; Easy shows the real path to the first bounce, a more forgiving cup and a higher stroke limit. A bot plays every hole at or under par (`games/putt-park/bot.ts`).
- **Pirate Cove / Korsan Koyu (2026-11-11):** the sixth 3D game, a pirate naval arcade (portrait) on a new import, the Kenney Pirate Kit 2.1 (`public/assets/kenney/pirate-kit`, only the 33 models the game uses). The player's black-sailed ship sails a faceted low-poly sea (waves computed from world coordinates, turquoise shallows and foam around the islands, a seeded archipelago round the home cove) under a chase camera that pulls back to keep the nearest fight in frame. Steer with the shared car steering (arrows, a ship's wheel or tilt on touch; ←/→ on keys), three sail levels (↑/↓ or the touch sail buttons; less sail turns tighter) and two broadsides, port (A/Z) and starboard (D/X), each with its own reload ring; volleys range themselves on a target abeam. Enemy volleys show red landing rings first, so a change of speed or course dodges them. Ten waves of missions: sink the patrol, grab the chests before the storm breaks (rain, darkening sky, lightning), shell a shore fort, escort a treasure ship to the cove, the Ghost Galleon in the fog (wave 5) and a final battle against it and its frigates (wave 10); between waves the hull gets a patch, and the cove's berth repairs it fully. Sunk ships leave chests (gold, flying coins to the HUD), barrels (repair) and bottles (quick reload); hits build a combo up to ×5. Easy / Normal per §7c (`TUNING` in `games/pirate-cove/waves.ts`), an autopilot test hook (`testAuto`) that clears Easy and reaches waves 9–10 on Normal.

- **Strike Alley / Strike Salonu (2026-11-11):** the seventh 3D game, ten-pin bowling in a glossy neon alley (portrait), separate from the 2D Bowling Strike. The player's platform character is the bowler (a rigged Kenney Mini Character): it takes the ball from the ball return (`pick-up`), stands with it (`holding-right`, the ball held beside the fist of its own right arm), walks the approach (`walk`, clip speed tied to the walking speed), releases (`interact-right`), and reacts in a camera facing it (`jump` / `emote-yes` on a strike, `emote-yes` on a spare, `emote-no` on a gutter or split), with three spectators who react too. Touch: slide left or right to pick the spot, then flick up to bowl; the flick's direction aims, its speed sets the ball speed and a curved flick adds hook. Keys: ←/→ spot, Space to aim, ←/→ direction, hold and release Space on a power meter, Z/X spin. A deterministic simulation at 1/120 s (`games/strike-alley/sim.ts`, shared with a headless bot) rolls the ball with a skid/hook/roll friction model on an oiled front and dry back end (the hook comes late; the oil wears shorter every frame so the line must move), drops it into the gutters, and moves the pins as rigid bodies (a column of spheres on the real profile plus a flat foot ring, sequential-impulse contacts with friction and restitution against the ball, each other, the deck, kickbacks, pit and hood; sleeping pins wake on contact). Real ten-pin scoring with the tenth frame's bonus balls (`scoring.ts`), a ten-frame scorecard chip with X and / marks, a rack diagram chip, call-outs (STRIKE!, DOUBLE!, TURKEY! / ÜÇLÜ STRIKE!, n strikes in a row, SPARE!, SPLIT!, SPLIT CONVERTED!, GUTTER!, MISS), a slow-motion strike and a low replay, a chase camera with a glowing ball track that shows the hook and a dramatic deck close-up; the sweep bar and setting table clear the deadwood and respot standing pins. Polish: fake lane reflections (mirrored pins and ball under slightly see-through boards plus a neon environment map), confetti, lane lights and neon colour cycling on strikes, camera shake, a synthesised ball rumble that follows the speed, pin clatter that scales with the pins going down, a synthesised crowd cheer and groan. Score = the ten-frame total (max 300). Easy: the ball's predicted path down the lane, a wider pocket (the last metres steer a ball heading near it into it), a gentler hook and slower oil wear. The alley, pins (lathed on the regulation profile) and ball are procedural geometry with canvas textures; people from Kenney Mini Characters; sounds from Kenney Impact and Junkala plus synthesised ones.

- **Crystal Keep / Kristal Kale (2026-11-11):** the eighth 3D game, a tower defense (portrait) on a new import, the Kenney Tower Defense Kit 2.0 (`public/assets/kenney/tower-defense-kit`, only the 59 models the game uses), separate from the 2D Tower Defense. Zombies and UFOs march on the crystal keep along a path built from the kit's tiles under a tilted 3/4 camera (drag to pan, pinch or the wheel to zoom). Tap a grass tile, pick one of four towers on the build bar (a ghost tower and its range ring show first) and tap it again to build: Ballista (homing bolts, ground and air), Cannon (lobbed shells with splash, beats armour, ground only), Catapult (long range, wide splash, ground only) and Turret (rapid fire, ×1.8 against flyers). Each tower upgrades twice with a taller stack of the kit's round or square pieces, sells for 70 % (Easy 80 %), and its weapon turns to the target with its own recoil (the ballista's bolt, the cannon's barrel, the catapult's arm). Enemies: zombies, fast runners, armoured brutes (halve bolts and bullets), UFOs and armoured gunships (fly straight at the keep in a gentle S, so only ballistas and turrets reach them), the Giant Zombie and the Mothership (drops UFOs) as bosses. Three maps: Green Valley (12 waves), River Crossing (14 waves, three bridges, golden autumn palette made from the kit's colormap at run time) and Frozen Pass (15 waves, snow tiles, two spawns that merge). Gold from kills (growing a little each wave) and wave bonuses, plus 2 gold per second left when the next wave is called early; lives lost at the keep (bosses take 10); stars per map from the lives left, kept in the core storage and unlocking the next map. Score = kills, wave bonuses, early calls and a clear bonus, summed over a run of maps (NEXT MAP or FINISH on the map-clear card). Touch: taps, the build bar and tower card, a START / CALL NOW wave button with the next wave's enemies, a 1× / 2× speed chip; keys: arrows move a cursor, 1–4 pick and build, Enter, U upgrade, S sell (twice), Space next wave, F speed. Easy / Normal per §7c (`TUNING` in `games/crystal-keep/sim.ts`: more gold and lives, weaker and slower enemies, a gentler ramp, longer countdowns); a rewarded continue gives half the lives back and clears the enemies near the keep. The rules are a pure simulation (`sim.ts`) shared with an autopilot bot (`bot.ts`): it clears every map on Easy with three stars; on Normal it always clears Green Valley (three stars) and River Crossing (one or two stars) and loses about four in ten Frozen Pass runs. Ground enemies are rigged Mini Characters instanced per body part from poses sampled once (their skins are rigid), UFOs, projectiles and effects are InstancedMeshes, the map is one merged mesh, a standing tower's masonry is one cached mesh and every kit model shares one material, so a frame takes about 45–80 draw calls with the shadow pass (79 with 16 top-tier towers, 22 enemies and their shots). Polish: lobbed cannonballs and boulders with explosions and splash rings, homing bolts and tracer bullets, hit flashes, death clips and puffs, crashing UFOs, coins flying to the gold chip, tower pieces dropping in with dust, upgrade sparks, health bars, camera shake on boss events and lost lives, a pulsing keep crystal that turns red when hurt, swirling spawn portals, flowing river water, wave banners with enemy previews, one hint per new idea, a live 3D battle behind the menu and UI icons rendered from the real models.

**Easy / Normal difficulty** (protocol 2.6, §7c of the new-game skill; Easy runs are practice and stay off the leaderboards): 35 games: air-hockey, alien-invaders, asteroid-storm, backgammon, bug-blaster, city-defender, connect-four, crystal-keep, dots-and-boxes, dungeon-dash, golden-podium, gomoku, head-soccer, hex-bridge, light-cycles, mangala, marble-maze, mud-rally, neon-pong, nine-mens-morris, okey, pirate-cove, putt-park, reversi, sea-battle, space-blaster, strike-alley, sumo-push, tank-arena, tito-tank, tower-defense, traffic-racer, turkish-draughts, ultimate-tictactoe, zombie-survivor.

**Work in progress:** none.

**Backlog:** empty. New concepts go into the concept list below.

## Concept list (80 games)

Columns: slug · EN title / TR title · concept · suggested assets (`public/assets/kenney/…`) · orientation (P = portrait, L = landscape).

## Batch A — space & shooters
| slug | title | concept | assets | o |
|---|---|---|---|---|
| space-blaster | Space Blaster / Uzay Avcısı | vertical shooter, waves, power-ups (reference game, done) | space-shooter | P |
| asteroid-storm | Asteroid Storm / Göktaşı Fırtınası | Asteroids: rotate/thrust/shoot, screen wrap, rocks split, UFO bonus | space-shooter (meteors, ships, ufo) | P |
| alien-invaders | Alien Invaders / Uzaylı İstilası | Space Invaders: marching formation, bunkers that erode, mystery UFO, speeds up | space-shooter enemies, alien-ufo | P |
| city-defender | City Defender / Şehir Savunması | Missile Command: tap to detonate interceptors, protect 6 cities, waves | space-shooter lasers/effects + drawn cities | P |
| lunar-lander | Lunar Lander / Ay İnişi | thrust/rotate, land softly on scored pads, fuel, procedural terrain per level | space-shooter ship/effects | P |
| ufo-abduction | UFO Abduction / UFO Kaçırma | steer UFO, hold beam to lift animals for points, dodge missiles & jets | alien-ufo, animals | P |

## Batch B — arcade classics
| slug | title | concept | assets | o |
|---|---|---|---|---|
| brick-breaker | Brick Breaker / Tuğla Kırıcı | Breakout with designed levels, multi-hit bricks, power-ups (wide, multiball, slow) | puzzle2 (paddles, balls, tiles) | P |
| neon-pong | Neon Pong / Neon Pong | vertical Pong vs adaptive AI, first to 7, ball speeds up, spin from paddle | puzzle2 paddles/balls | P |
| retro-snake | Retro Snake / Retro Yılan | grid snake, speed up, bonus fruit timer, walls mode | onebit / micro-roguelike or drawn | P |
| block-drop | Block Drop / Blok Düşür | Tetris-like: 7 pieces, hold, ghost, levels, line clears | puzzle (element squares) | P |
| maze-muncher | Maze Muncher / Labirent Yiyici | Pac-Man-like maze, dots, power pellets, 4 ghosts with different AI | micro-roguelike / drawn | P |
| bug-blaster | Bug Blaster / Böcek Avcısı | Centipede-like: segmented bug weaves down through mushrooms, spider | pixel-platformer / drawn | P |

## Batch C — one-button & casual arcade
| slug | title | concept | assets | o |
|---|---|---|---|---|
| tappy-plane | Tappy Plane / Pıt Pıt Uçak | flap through rock gaps, medals at 10/25/50 | tappy-plane | P |
| sky-road | Sky Road / Gök Yolu | 3D runner: a car on floating blocks, lanes, jumps, coins, three lives | car-kit + platformer-kit (3D) | P |
| sky-jumper | Sky Jumper / Gök Zıplayıcı | Doodle-Jump: auto bounce, tilt/drag/arrows, moving & breaking platforms, springs, enemies | jumper | P |
| cave-copter | Cave Copter / Mağara Helikopteri | hold to rise, narrowing procedural cave, obstacles | tappy-plane / pixel-platformer | P |
| stack-tower | Stack Tower / Kule Diz | sliding block, tap to drop, overhang is cut, perfect-drop bonus | drawn + puzzle2 tiles | P |
| color-gate | Color Gate / Renk Kapısı | tap to hop ball through rotating multi-colour rings matching its colour | drawn | P |
| axe-throw | Axe Throw / Balta Atışı | throw knives into a rotating log; don't hit other knives; boss logs | shooting-gallery / drawn | P |

## Batch D — action
| slug | title | concept | assets | o |
|---|---|---|---|---|
| tank-arena | Tank Arena / Tank Arenası | top-down tank vs AI tanks, destructible crates, power-ups, waves | tanks | L |
| zombie-survivor | Zombie Survivor / Zombi Hayatta Kalma | twin-stick survival, auto-aim option, weapon upgrades, waves | topdown-shooter | L |
| pirate-cove | Pirate Cove / Korsan Koyu | 3D pirate naval arcade: sail levels, port and starboard broadsides with reload, dodge red landing rings, 10 mission waves (patrol, treasure before the storm, forts, escort, Ghost Galleon), loot, cove repairs | pirate-kit (3D) | P |
| pixel-runner | Pixel Runner / Piksel Koşucu | endless runner: jump/double-jump, gaps, enemies, coins, speed ramps | pixel-platformer (pixelArt) | L |
| traffic-racer | Traffic Racer / Trafik Yarışçısı | lane-dodge highway racing on the shared car steering, BOOST (double points) and BRAKE, near-miss combos, fuel/coins | racing | P |
| road-crosser | Road Crosser / Yol Geçidi | Frogger: cross roads and rivers (logs), reach homes, levels | animals, racing | P |
| shooting-gallery | Shooting Gallery / Atış Poligonu | tap moving duck/target rows, bullets & reload, timed rounds | shooting-gallery | L |

## Batch E — more action
| slug | title | concept | assets | o |
|---|---|---|---|---|
| tower-defense | Tower Defense / Kule Savunması | fixed-path TD, 3 tower types + upgrade, 15 waves | tower-defense | L |
| crystal-keep | Crystal Keep / Kristal Kale | 3D tower defense on the Kenney Tower Defense Kit: 4 towers × 3 tiers, zombies, brutes, UFOs and two bosses, 3 maps with 12–15 waves, stars, early wave calls, 1×/2× speed | tower-defense-kit (3D) + mini-characters | P |
| dungeon-dash | Dungeon Dash / Zindan Koşusu | turn-based micro-roguelike: floors, monsters, potions, stairs | micro-roguelike (pixelArt) | P |
| coin-catcher | Coin Catcher / Altın Avcısı | move catcher, catch coins/gems, avoid bombs, combo multiplier | platformer items | P |
| platform-hopper | Platform Hopper / Platform Zıpzıp | single-screen platformer levels: collect gems, avoid enemies, reach flag | simple-platformer | L |
| fish-frenzy | Fish Frenzy / Balık Çılgınlığı | eat smaller fish to grow, avoid bigger ones, sharks | fish | L |
| whack-a-mole | Whack-a-Mole / Köstebek Avı | animals pop from holes, hit them, avoid bombs, speed ramps | animals, foliage | P |

## Batch F — sports & physics
| slug | title | concept | assets | o |
|---|---|---|---|---|
| hoop-shot | Hoop Shot / Basket Atışı | flick/aim basketball into moving hoop, streak bonus, timer | sports | P |
| penalty-kick | Penalty Kick / Penaltı Atışı | swipe/aim shot vs keeper, curve, rounds, then keeper mode | sports | P |
| mini-golf | Mini Golf / Mini Golf | top-down drag-to-putt, 9 holes with walls/water/bumpers, par | sports + drawn | P |
| putt-park | Putt Park / Golf Parkı | 3D mini golf: 18 holes on two courses (meadow, castle), drag-back putting, ramps, jumps, windmill, tunnels, movers, par scoring | minigolf-kit + nature-kit (3D) | P |
| plinko-drop | Plinko Drop / Plinko | drop balls through pegs (matter physics) into scoring slots, limited balls | puzzle2 balls | P |
| bowling-strike | Bowling Strike / Bowling | aim + power + spin, 10 frames with real scoring | sports + drawn | P |
| strike-alley | Strike Alley / Strike Salonu | 3D ten-pin bowling in a neon alley: slide-and-flick (or keys and a power meter) throws with hook, skid/hook/roll ball physics on an oil pattern that wears, rigid-body pins, real 10-frame scoring, replays and call-outs; the bowler is the player's platform character as a rigged Kenney Mini Character | mini-characters (3D) + procedural alley | P |
| air-hockey | Air Hockey / Hava Hokeyi | vs AI, first to 7, physics puck | drawn | P |
| mud-rally | Mud Rally / Çamur Rallisi | 3D single-screen off-road truck racing: 4 laps, jumps, mud, nitro, prize money and garage upgrades between races, 6 arenas | car-kit + racing-kit + nature-kit + platformer-kit (3D) | L |
| golden-podium | Golden Podium / Altın Kürsü | 3D five-event athletics cup vs three AI rivals (sprint, hurdles, long jump, 50 m swim, archery), medals and points per event, medal table and podium; the athletes are rigged 3D models from Kenney Mini Characters (the player's platform character mapped to its closest model, rivals the male models), animated with the models' own clips (sprint, jump, fall, sit, emote-yes …; swimming drives the arm and leg bones) | racing-kit + nature-kit + mini-characters (3D) + medals | L |

## Batch G — puzzle I
| slug | title | concept | assets | o |
|---|---|---|---|---|
| gem-match | Gem Match / Mücevher Eşle | match-3 swap, cascades, specials, moves-limited levels | puzzle elements | P |
| sokoban | Box Pusher / Kutu İtici | Sokoban: 20 handmade levels, undo, move counter | sokoban | P |
| merge-2048 | Merge 2048 / 2048 | swipe/arrow tile merge, undo once, win at 2048 + continue | drawn | P |
| mine-sweeper | Mine Sweeper / Mayın Tarlası | 3 difficulties, flag mode toggle for touch, timer | onebit / drawn | P |
| memory-match | Memory Match / Hafıza Kartları | flip pairs of animal cards, levels grow grid, timer stars | animals | P |
| slide-puzzle | Slide Puzzle / Kaydırmalı Bulmaca | 3x3/4x4/5x5 sliding tiles, solvable shuffles, moves | drawn / letter-tiles | P |

## Batch H — puzzle II
| slug | title | concept | assets | o |
|---|---|---|---|---|
| bubble-pop | Bubble Pop / Balon Patlat | bubble shooter: aim, wall bounces, match 3, ceiling drops | puzzle2 balls | P |
| block-blast | Block Burst / Blok Patlaması | place 3 pieces on 8x8, clear rows/cols, game over when no fit | puzzle tiles | P |
| lights-out | Lights Out / Işıkları Söndür | toggle cross patterns, solvable generated levels | drawn | P |
| pipe-flow | Pipe Flow / Boru Akışı | rotate pipes to connect source to drain before water flows | puzzle2 pipes | P |
| hex-merge | Hex Merge / Altıgen Birleştir | drop numbered hex pieces on hex board, merge 3 of a kind | hexagon / drawn | P |
| letter-loop | Letter Loop / Harf Çemberi | letter-wheel crossword, TR and EN word lists, bonus words, hints, timed levels | drawn | P |
| letter-rain | Letter Rain / Harf Yağmuru | falling letters on a 7×9 board, spell words from neighbouring tiles before a column overflows; gold, bomb and cracked tiles, levels speed up the rain | drawn | P |
| secret-word | Secret Word / Gizli Kelime | guess the hidden word in six tries (green / amber / grey letters), words in a row against the clock, 4 → 5 → 6 letters, streak multiplier, three lives, reveal and drop-five jokers | drawn | P |
| word-hunt | Word Hunt / Kelime Avı | word search with TR and EN word lists by theme, drag to select | letter-tiles | P |

## Batch I — board, cards & brain
| slug | title | concept | assets | o |
|---|---|---|---|---|
| connect-four | Connect Four / Dört Bağla | vs minimax AI with difficulty | boardgame chips | P |
| reversi | Reversi / Reversi | Othello vs AI, legal-move hints | boardgame pieces | P |
| solitaire | Solitaire / Solitaire | Klondike, draw 1, tap-to-auto-move, undo | boardgame cards | P |
| simon-says | Simon Says / Simon Der Ki | repeat growing colour/tone sequence | drawn + sfx | P |
| nonogram | Pixel Logic / Piksel Mantık | picross puzzles 5x5→10x10 forming pixel pictures | drawn | P |
| tile-triple | Tile Triple / Üçlü Taş | stacked tiles, pick into 7-slot tray, 3 of a kind clear | game-icons / emotes | P |

## Batch J — two-player (online + vs AI)
Every game here has a full solo mode against an AI and an online mode for two players (`"multiplayer": true`, skill §7a): the room's host takes the first turn, then the winner of the previous round (`net.starter` / `net.myTurnFirst`).

| slug | title | concept | assets | o |
|---|---|---|---|---|
| gomoku | Five in a Row / Beşli Taş | Gomoku on a 15x15 board: five in a row wins; threat-based AI that ramps up; online: alternate stones, the starter plays black | boardgame / drawn | P |
| dots-and-boxes | Dots and Boxes / Kutu Kapmaca | 5x5 boxes: draw a line, closing a box scores and gives another move; AI avoids third sides and plays chains; online: same rules, both sides apply moves | drawn | P |
| sea-battle | Sea Battle / Amiral Battı | 10x10 fleets, drag/rotate or auto placement, a hit shoots again; hunt-and-target AI; online: both place secretly, shots go out and the owner answers hit / miss / sunk | drawn + particles | P |
| turkish-draughts | Turkish Draughts / Dama | Türk daması on 8x8: pieces move forward and sideways, captures are compulsory and the longest capture must be taken, kings fly; AI with depth levels; online: alternate moves | boardgame pieces / drawn | P |
| light-cycles | Light Cycles / Işık Motorları | Tron duel on a grid: steer with arrows or swipes, trails stay, crash loses, best of 5, speed ramps; AI rivals; online: the host simulates, the guest sends turns | drawn neon | P |

## Batch K — wave 3 solo
| slug | title | concept | assets | o |
|---|---|---|---|---|
| sudoku | Sudoku / Sudoku | generated unique-solution puzzles in 4 difficulties, notes mode, 3 mistakes, hints, timer | drawn | P |
| fruit-slash | Fruit Slash / Meyve Kes | swipe through tossed fruit, avoid bombs, multi-slice combos, 3 misses ends the run | drawn + particles | P |
| jetpack-rush | Jetpack Rush / Jetpack Koşusu | hold to fly, zappers, warned missiles, coins, distance and speed ramp | pixel-platformer / space-shooter | L |
| bomb-maze | Bomb Maze / Bomba Labirenti | Bomberman-like grid levels vs AI bots, breakable crates, power-ups (range, bombs, speed) | micro-roguelike / drawn | P |
| archery | Archery / Okçuluk | drag to draw and aim with wind, moving targets at growing distances, rounds | shooting-gallery / sports | L |


## Batch L — wave 4 two-player (online + vs AI)
Same rules as batch J: a full solo mode against an AI and an online mode (`"multiplayer": true`). Round 1 starts with the host, later rounds with `net.starter` / `net.myTurnFirst`.

| slug | title | concept | assets | o |
|---|---|---|---|---|
| mangala | Mangala / Mangala | Turkish mancala: 2x6 pits of 4 stones and two stores; sow counter-clockwise starting in the picked pit (a single stone moves on), last stone in your store plays again, an even count in a rival pit captures it, last stone in your own empty pit captures the opposite pit; the side that empties first takes the rest; AI with lookahead | drawn | P |
| backgammon | Backgammon / Tavla | one game to 5 points (plain win 1, gammon/mars 2), standard moves, bar, bearing off, doubles move four times, forced-move rules; tap a checker then a target with hints; AI picks the best move by a heuristic; online: the mover rolls and sends dice and moves | drawn / boardgame dice | L |
| head-soccer | Head Soccer / Kafa Topu | 1v1 side-view football with big-headed player characters: run, jump, kick; 60-second matches, golden goal on a draw; AI rival; online: the host simulates, the guest sends input; each side shows its own platform character (`playerCharacter()` / `peerCharacter()`) | characters + sports pack | L |

## Batch M — wave 4 solo
| slug | title | concept | assets | o |
|---|---|---|---|---|
| water-sort | Water Sort / Su Sıralama | pour coloured layers between tubes until each tube holds one colour; generated solvable levels that grow, undo, extra empty tube as a help | drawn | P |
| pinball | Pinball / Tilt | five tall scrolling tables (Neon Nights, Deep Blue, Jungle Temple, Fire Forge, Star Gate), each with its own ramps, orbits, spinners, saucers, cannon, vortex, wormhole, drop banks and upper flippers; a table's target score opens the next, opened tables can be picked; missions and jackpots, dot-matrix display, tilt; left/right keys or screen halves | drawn + particles | P |
| rope-swing | Rope Swing / İp Salıncağı | hold to fire a rope at the ceiling and swing, release to fly; distance score, coins, gaps and spikes, speed ramps; the hero is the player's character | characters + pixel-platformer | L |

## Batch N — wave 5 two-player (online + vs AI)
Same rules as batch J: a full solo mode against an AI and an online mode (`"multiplayer": true`). Round 1 starts with the host, later rounds with `net.starter` / `net.myTurnFirst`.

| slug | title | concept | assets | o |
|---|---|---|---|---|
| ~~color-race~~ | Color Race / Renk Yarışı (retired 2026-11-06, moved to `wip/`: too close to Color Gate) | Color Gate as a race: both climb the same seeded course of rotating rings, passing only through your colour; a wrong colour sends you back to the last checkpoint; first to the top (or furthest at 90 s) wins; solo races an AI ghost; online: each side plays its own run on the shared seed and sends its height, shown as the rival's ghost | drawn | P |
| ultimate-tictactoe | Ultimate Tic-Tac-Toe / Süper XOX | nine small boards in a big one: your move sends the rival to the matching small board, win three small boards in a row; AI with MCTS that ramps up; online: alternate moves | drawn | P |
| hex-bridge | Hex / Hex Köprüsü | connection game on an 11x11 rhombus: red joins top-bottom, blue left-right, no draws; swap rule after the first move; AI with shortest-path evaluation plus search; online: alternate moves | drawn hexes | P |
| nine-mens-morris | Nine Men's Morris / Dokuz Taş | place nine stones each, then move along the lines, fly with three; a mill (three in a row) removes a rival stone; down to two stones or no move loses; minimax AI; online: alternate moves | boardgame pieces / drawn | P |
| sumo-push | Sumo Push / Sumo Güreşi | top-down ring: steer your wrestler, charge to dash, shove the rival out; the ring shrinks over time; best of 5 bouts; AI rival; online: the host simulates, the guest sends input | drawn | P |

## Batch O — wave 5 solo (colour and one-touch, like Color Gate)
| slug | title | concept | assets | o |
|---|---|---|---|---|
| color-road | Color Road / Renk Yolu | a ball rolls down an endless lane: drag sideways to hit only blocks of your colour, gates switch your colour, a wrong hit ends the run; speed ramps | drawn + particles | P |
| color-wheel | Color Wheel / Renk Çarkı | a ring of colour segments in the middle: dots fly in from all sides, rotate the ring (tap halves, drag or arrows) so each dot hits its colour; waves get faster and denser | drawn | P |
| color-bounce | Color Bounce / Renkli Zıplama | the ball bounces up a tower of coloured bars: tap to change its colour before it lands, matching bars bounce it on, a wrong one breaks the run; moving and splitting bars | drawn | P |
| paint-roll | Paint Roll / Boya Yuvarla | swipe a paint ball that slides until a wall, colouring every tile it crosses; fill the whole maze; generated solvable levels that grow, move count stars | drawn | P |
| orbit-hop | Orbit Hop / Yörünge Atlayışı | the ship circles a planet: tap to launch straight ahead and catch the next planet's orbit; miss and drift into space; comets and shrinking orbits, distance score | drawn + space-shooter | P |

## Tito's Tank — artillery duel (from the owner's `selchook/tito-multiplayer`)
| slug | title | concept | assets | o |
|---|---|---|---|---|
| tito-tank | Tito's Tank / Tito'nun Tankı | side-view artillery duel on destructible hills: drive on your pad, aim the barrel, hold FIRE to charge, read the wind; one hit destroys a tank; first to 3 rounds; rounds get rougher and wider (morning to night skies); AI that searches its shot and sharpens each turn; the player's character commands from the hatch; online: alternate shots, the shooter's landing spot is authoritative | drawn tanks/terrain + tanks smoke | L |
