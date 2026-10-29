# Ayvago launch catalogue

## Status (54 shipped)

**Shipped.** All 54 games in the concept list. Every one passes the smoke test, the GHA protocol test and manifest validation, and is in the platform catalog:
air-hockey, alien-invaders, asteroid-storm, axe-throw, block-blast, block-drop, bowling-strike, brick-breaker, bubble-pop, bug-blaster, cave-copter, city-defender, coin-catcher, color-gate, connect-four, dungeon-dash, fish-frenzy, gem-match, hex-merge, hoop-shot, lights-out, lunar-lander, maze-muncher, memory-match, merge-2048, mine-sweeper, mini-golf, neon-pong, nonogram, penalty-kick, pipe-flow, pixel-runner, platform-hopper, plinko-drop, retro-snake, reversi, road-crosser, shooting-gallery, simon-says, sky-jumper, slide-puzzle, sokoban, solitaire, space-blaster, stack-tower, tank-arena, tappy-plane, tile-triple, tower-defense, traffic-racer, ufo-abduction, whack-a-mole, word-hunt, zombie-survivor.

- **Launch wave (2026-10-27):** 26 games.
- **Second wave (2026-10-28):** 28 games. These are the former backlog plus dungeon-dash and nonogram, finished from `wip/`. Each carries `platform.addedAt` in its `game.json`.

**Work in progress:** wave 3 (2026-10-29), 10 games in batches J and K. The five in batch J are playable online by two players (`"multiplayer": true`).

**Backlog:** empty. New concepts go into the concept list below.

## Concept list (54 games)

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
| pixel-runner | Pixel Runner / Piksel Koşucu | endless runner: jump/double-jump, gaps, enemies, coins, speed ramps | pixel-platformer (pixelArt) | L |
| traffic-racer | Traffic Racer / Trafik Yarışçısı | lane-dodge highway racing, near-miss bonus, fuel/coins | racing | P |
| road-crosser | Road Crosser / Yol Geçidi | Frogger: cross roads and rivers (logs), reach homes, levels | animals, racing | P |
| shooting-gallery | Shooting Gallery / Atış Poligonu | tap moving duck/target rows, bullets & reload, timed rounds | shooting-gallery | L |

## Batch E — more action
| slug | title | concept | assets | o |
|---|---|---|---|---|
| tower-defense | Tower Defense / Kule Savunması | fixed-path TD, 3 tower types + upgrade, 15 waves | tower-defense | L |
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
| plinko-drop | Plinko Drop / Plinko | drop balls through pegs (matter physics) into scoring slots, limited balls | puzzle2 balls | P |
| bowling-strike | Bowling Strike / Bowling | aim + power + spin, 10 frames with real scoring | sports + drawn | P |
| air-hockey | Air Hockey / Hava Hokeyi | vs AI, first to 7, physics puck | drawn | P |

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
| block-blast | Block Blast / Blok Patlat | place 3 pieces on 8x8, clear rows/cols, game over when no fit | puzzle tiles | P |
| lights-out | Lights Out / Işıkları Söndür | toggle cross patterns, solvable generated levels | drawn | P |
| pipe-flow | Pipe Flow / Boru Akışı | rotate pipes to connect source to drain before water flows | puzzle2 pipes | P |
| hex-merge | Hex Merge / Altıgen Birleştir | drop numbered hex pieces on hex board, merge 3 of a kind | hexagon / drawn | P |
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

