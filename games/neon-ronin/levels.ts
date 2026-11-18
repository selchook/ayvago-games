// Neon Ronin: the hand-made levels. Four districts, each with three levels and a boss arena (16 in
// all). A level is a row of segments drawn in ASCII (one character per 1 m cell, rows top to bottom,
// bottom-aligned on a 14-row grid; every segment starts and ends on the rooftop at height 3), plus
// its par time and its tutorial prompts. The legend:
//   #  rooftop / wall          =  one-way ledge        F  falling ledge (one-way)
//   B  bridge (lowered by its lever)                   D  door (opened by its lever)
//   Z  live cable (cycles)     S  steam vent (plume 3 m up)   L  laser gate (cycles)
//   P  start   K  checkpoint   X  exit beacon
//   c  data chip (3 a level)   o  gear   b  lootbox   h  repair kit   H  heart (max HP)   t  coolant
//   x  explosive tank          l  lever
//   w  walker   g  gunner   d  drone   q  gun drone   r  brute
//   T  gun turret   C  cannon turret   U  double turret   V  teleporter   M  the boss
export const ROWS = 14;

type Seg = string[];

/** A flat rooftop `w` wide with `top` (the row on the roof) and optional rows above it (top first). */
function flat(top: string, above: string[] = [], w = top.length): Seg {
  const row = '#'.repeat(w);
  return [...above, top.padEnd(w), row, row, row];
}
/** A pit `n` wide. */
const pit = (n: number): Seg => [' '.repeat(n)];

// ------------------------------------------------------------------ segments

const S = {
  start: flat('  P       '),
  startK: flat('  P   o o '),
  exit: [
    '           #',
    '           #',
    '           #',
    '           #',
    '           #',
    '           #',
    '           #',
    '      X    #',
    '############',
    '############',
    '############',
  ],
  check: flat('   K    '),
  // ---- the tutorial
  tMove: flat('    o o o   '),
  tJump: [
    '     ##     ',
    '  o  ##  o  ',
    '############',
    '############',
    '############',
  ],
  tDouble: [
    '      c      ',
    '             ',
    '     ##      ',
    '     ##      ',
    '     ##      ',
    '  o  ##   o  ',
    '#############',
    '#############',
    '#############',
  ],
  tAttack: flat('   o      w      '),
  tShoot: flat('     o           g  '),
  tRoll: [
    '                        ',
    '                        ',
    '               ===      ',
    '                        ',
    '     o o           g    ',
    '########################',
    '########################',
    '########################',
  ],
  tLunge: flat('       w     w     '),
  // ---- gaps and jumps
  gap3: pit(3),
  gap4: pit(4),
  gap5: pit(5),
  gap6: pit(6),
  steps: [
    '              ##      ',
    '          o ####      ',
    '        ##########    ',
    '      ############    ',
    '   o ##############   ',
    '######################',
    '######################',
    '######################',
  ],
  ledges: [
    '        o       ',
    '       ===      ',
    '                ',
    '   ===     ===  ',
    '                ',
    '                ',
    '                ',
    '                ',
  ],
  ledgesHigh: [
    '         c        ',
    '        ===       ',
    '                  ',
    '    ===     ===   ',
    '                  ',
    '                  ',
    '                  ',
    '                  ',
  ],
  falling: [
    '                  ',
    '  o   o    o   o  ',
    '  FF  FF   FF  FF ',
    '                  ',
    '                  ',
    '                  ',
  ],
  fallingLong: [
    '         o      c        ',
    '        FFF    FFF       ',
    '  FF                FF   ',
    '                         ',
    '                         ',
    '                         ',
  ],
  tower: [
    '        c          ',
    '                   ',
    '      =====        ',
    '                   ',
    '   ###########     ',
    '   ###########     ',
    '   ###########  o  ',
    '   ###########     ',
    '###################',
    '###################',
    '###################',
  ],
  // ---- foes
  walkers: flat('   o    w        w    o  '),
  gunners: [
    '                       ',
    '             ====      ',
    '                       ',
    '                       ',
    '    o     g       g    ',
    '#######################',
    '#######################',
    '#######################',
  ],
  drones: [
    '           d          d   ',
    '                          ',
    '    d                     ',
    '                          ',
    '                          ',
    '   o      o    o      o   ',
    '##########################',
    '##########################',
    '##########################',
  ],
  mixed: [
    '                d         ',
    '                          ',
    '        =====             ',
    '                          ',
    '  o  w       g      w  o  ',
    '##########################',
    '##########################',
    '##########################',
  ],
  turretRoof: [
    '                       ',
    '          T            ',
    '       #######         ',
    '   o   #######     w   ',
    '#######################',
    '#######################',
    '#######################',
  ],
  turretPit: [
    '                        ',
    '                        ',
    '                 T      ',
    '       ===    ######    ',
    '              ######    ',
    '              ######    ',
    '              ######    ',
    '              ######    ',
  ],
  cannonYard: flat('    o   x      g        C  '),
  doubleNest: [
    '                          ',
    '                 U        ',
    '          ##############  ',
    '   ===    ##############  ',
    '          ##############  ',
    '  o   x   ##############  ',
    '##########################',
    '##########################',
    '##########################',
  ],
  brute: flat('   o       r          o   '),
  bruteDuo: flat('   h     r          r       '),
  teleYard: flat('   o      V            g     '),
  gdrones: [
    '            q             ',
    '                    q     ',
    '                          ',
    '   ====         ====      ',
    '                          ',
    '  o      o   x     o      ',
    '##########################',
    '##########################',
    '##########################',
  ],
  loot: flat('  x  b  o o  x   '),
  lootHeart: flat('  b   H   b  '),
  ambush: [
    '              d           ',
    '                          ',
    '          g               ',
    '        =======           ',
    '                          ',
    '  o   w            w    o ',
    '##########################',
    '##########################',
    '##########################',
  ],
  gauntlet: [
    '                 q          ',
    '                            ',
    '                            ',
    '   o      r          g   o  ',
    '############################',
    '############################',
    '############################',
  ],
  turretAlley: [
    '                             ',
    '      T             C        ',
    '    #####         #####      ',
    '  o #####   w  w  #####   o  ',
    '#############################',
    '#############################',
    '#############################',
  ],
  doubleAlley: [
    '                             ',
    '      U             T        ',
    '    #####         #####      ',
    '  o #####   w  g  #####   o  ',
    '#############################',
    '#############################',
    '#############################',
  ],
  droneSwarm: [
    '     d        q        d    ',
    '                            ',
    '        d          d        ',
    '                            ',
    '    =====    =====    ====  ',
    '                            ',
    '                            ',
    '                            ',
  ],
  // ---- hazards
  cables: [
    '#########################',
    '      Z        Z         ',
    '      Z        Z         ',
    '      Z        Z         ',
    '      Z        Z         ',
    '      Z        Z         ',
    '      Z        Z         ',
    '      Z        Z         ',
    '      Z        Z         ',
    '  o   Z   o    Z    o    ',
    '#########################',
    '#########################',
    '#########################',
  ],
  cablesHigh: [
    '      Z      Z      Z      ',
    '      Z      Z      Z      ',
    '      Z      Z      Z      ',
    '      Z      Z      Z      ',
    '      Z      Z      Z      ',
    '      Z      Z      Z      ',
    '                           ',
    '  o      o      o      o   ',
    '###########################',
    '###########################',
    '###########################',
  ],
  steam: flat('   o   S    o    S    o   S    '),
  steamClimb: [
    '                      ',
    '                 c    ',
    '              ======  ',
    '                      ',
    '       ===            ',
    '                      ',
    '   o   S    S    S    ',
    '######################',
    '######################',
    '######################',
  ],
  lasers: [
    '                          ',
    '                          ',
    '                          ',
    '       L         L        ',
    '       L         L        ',
    '       L         L        ',
    '  o    L    o    L    o   ',
    '##########################',
    '##########################',
    '##########################',
  ],
  laserLedges: [
    '                            ',
    '        =====               ',
    '                            ',
    '                L     L     ',
    '    ===         L     L     ',
    '                L     L     ',
    '                L     L     ',
    '  o   S      o  L  o  L  o  ',
    '############################',
    '############################',
    '############################',
  ],
  // ---- levers, doors, bridges
  door: [
    '                   #####   ',
    '                   #####   ',
    '                   #####   ',
    '                   #####   ',
    '                   #####   ',
    '                   #####   ',
    '                   #####   ',
    '                   #####   ',
    '                   D       ',
    '                   D       ',
    '    l     o    w   D    o  ',
    '###########################',
    '###########################',
    '###########################',
  ],
  bridge: [
    '         c                ',
    '        ===               ',
    '                          ',
    '  l o                     ',
    '#####BBBBBBBBBBBBB########',
    '#####             ########',
    '#####             ########',
  ],
  // ---- secrets
  secretHigh: [
    '      c      ',
    '     ===     ',
    '             ',
    '             ',
    '   ===       ',
    '             ',
    '             ',
    '    o   o    ',
    '#############',
    '#############',
    '#############',
  ],
  secretPit: [
    '       c       ',
    '               ',
    '               ',
    '   o       o   ',
    '     =====     ',
    '               ',
    '               ',
  ],
  chipRoof: flat('     c      '),
  heal: flat('   h   o  '),
  tank: flat('   t   o  '),
  // ---- boss arenas
  arena: [
    '#                                          #',
    '#                                          #',
    '#                                          #',
    '#                                          #',
    '#                                          #',
    '#                                          #',
    '#     ======                    ======     #',
    '#                                          #',
    '#                                          #',
    '#   P      h                  M        X   #',
    '############################################',
    '############################################',
    '############################################',
  ],
  arenaTurrets: [
    '#                                          #',
    '#                                          #',
    '#                                          #',
    '#                                          #',
    '#                                          #',
    '#    T                                T    #',
    '#  ######                          ######  #',
    '#                                          #',
    '#                                          #',
    '#   P      h                  M        X   #',
    '############################################',
    '############################################',
    '############################################',
  ],
  arenaCannons: [
    '#                                          #',
    '#                                          #',
    '#                                          #',
    '#                                          #',
    '#                                          #',
    '#    C                                C    #',
    '#  ######        =======           ######  #',
    '#                                          #',
    '#                                          #',
    '#   P      h          t       M        X   #',
    '############################################',
    '############################################',
    '############################################',
  ],
  arenaSpire: [
    '#                                          #',
    '#                                          #',
    '#                                          #',
    '#                                          #',
    '#                                          #',
    '#    U                V               T    #',
    '#  ######        =======           ######  #',
    '#                                          #',
    '#                                          #',
    '#   P      h          t       M        X   #',
    '############################################',
    '############################################',
    '############################################',
  ],
};
export type SegId = keyof typeof S;

// ------------------------------------------------------------------ levels

export interface Tip { x: number; key: string }
export interface LevelDef {
  id: string;
  district: number;
  index: number;
  boss: boolean;
  /** Par time for the third star (seconds; a boss level's third star is no hits taken). */
  par: number;
  segs: SegId[];
  tips?: Array<{ seg: number; dx: number; key: string }>;
  /** The level's rows (built from the segments). */
  rows: string[];
  tipsX: Tip[];
  width: number;
}

type Raw = Omit<LevelDef, 'rows' | 'tipsX' | 'width' | 'id'>;

const RAW: Raw[] = [
  // ---- district 1: Neon Docks (walkers, gunners, drones, falling ledges)
  {
    district: 0, index: 0, boss: false, par: 60,
    segs: ['start', 'tMove', 'tJump', 'gap3', 'tDouble', 'tAttack', 'tShoot', 'check', 'tRoll', 'tLunge', 'gap4', 'secretHigh', 'falling', 'chipRoof', 'walkers', 'exit'],
    tips: [
      { seg: 0, dx: 2, key: 'tipMove' }, { seg: 2, dx: 1, key: 'tipJump' }, { seg: 4, dx: 0, key: 'tipDouble' },
      { seg: 5, dx: 2, key: 'tipAttack' }, { seg: 6, dx: 3, key: 'tipShoot' }, { seg: 7, dx: 1, key: 'tipCheck' },
      { seg: 8, dx: 4, key: 'tipRoll' }, { seg: 9, dx: 2, key: 'tipLunge' }, { seg: 11, dx: 1, key: 'tipChips' },
      { seg: 12, dx: 0, key: 'tipFall' }, { seg: 15, dx: 2, key: 'tipExit' },
    ],
  },
  { district: 0, index: 1, boss: false, par: 65, segs: ['start', 'walkers', 'gap4', 'gunners', 'ledges', 'chipRoof', 'check', 'drones', 'fallingLong', 'loot', 'ambush', 'secretHigh', 'mixed', 'gap5', 'exit'] },
  { district: 0, index: 2, boss: false, par: 80, tips: [{ seg: 2, dx: 0, key: 'tipWall' }], segs: ['startK', 'mixed', 'tower', 'gap4', 'drones', 'check', 'falling', 'ambush', 'loot', 'ledgesHigh', 'gunners', 'secretPit', 'walkers', 'heal', 'droneSwarm', 'mixed', 'exit'] },
  { district: 0, index: 3, boss: true, par: 60, segs: ['arena'] },
  // ---- district 2: Circuit Market (brutes, gun turrets, live cables, levers and doors)
  { district: 1, index: 0, boss: false, par: 75, segs: ['start', 'brute', 'gap3', 'cables', 'chipRoof', 'turretRoof', 'check', 'door', 'ambush', 'walkers', 'fallingLong', 'secretHigh', 'gauntlet', 'mixed', 'exit'], tips: [{ seg: 1, dx: 3, key: 'tipCleave' }, { seg: 3, dx: 1, key: 'tipCable' }, { seg: 7, dx: 2, key: 'tipLever' }] },
  { district: 1, index: 1, boss: false, par: 85, segs: ['startK', 'turretPit', 'gunners', 'cablesHigh', 'ambush', 'check', 'bridge', 'bruteDuo', 'loot', 'ledgesHigh', 'turretAlley', 'turretRoof', 'secretPit', 'gauntlet', 'exit'], tips: [{ seg: 6, dx: 1, key: 'tipLever' }] },
  { district: 1, index: 2, boss: false, par: 110, segs: ['start', 'mixed', 'cables', 'door', 'check', 'brute', 'turretPit', 'ambush', 'lootHeart', 'fallingLong', 'droneSwarm', 'drones', 'chipRoof', 'cablesHigh', 'turretAlley', 'secretHigh', 'bruteDuo', 'gauntlet', 'exit'] },
  { district: 1, index: 3, boss: true, par: 60, segs: ['arenaTurrets'] },
  // ---- district 3: Smog Stacks (steam, cannons, gun drones, teleporters)
  { district: 2, index: 0, boss: false, par: 85, segs: ['start', 'steam', 'gdrones', 'gap4', 'cannonYard', 'chipRoof', 'ambush', 'check', 'teleYard', 'steamClimb', 'turretAlley', 'loot', 'secretHigh', 'gauntlet', 'walkers', 'exit'], tips: [{ seg: 1, dx: 2, key: 'tipSteam' }, { seg: 3, dx: 1, key: 'tipSlam' }, { seg: 8, dx: 3, key: 'tipTele' }] },
  { district: 2, index: 1, boss: false, par: 95, segs: ['startK', 'cannonYard', 'tower', 'steam', 'ambush', 'check', 'gdrones', 'bridge', 'brute', 'droneSwarm', 'falling', 'teleYard', 'turretAlley', 'secretPit', 'gauntlet', 'exit'] },
  { district: 2, index: 2, boss: false, par: 105, segs: ['start', 'gdrones', 'steamClimb', 'cables', 'ambush', 'check', 'teleYard', 'door', 'bruteDuo', 'droneSwarm', 'lootHeart', 'cannonYard', 'turretAlley', 'chipRoof', 'falling', 'secretHigh', 'gauntlet', 'mixed', 'exit'] },
  { district: 2, index: 3, boss: true, par: 75, segs: ['arenaCannons'] },
  // ---- district 4: Zenith Spire (lasers, double turrets, everything)
  { district: 3, index: 0, boss: false, par: 105, segs: ['start', 'lasers', 'doubleNest', 'gap5', 'gdrones', 'ambush', 'ledgesHigh', 'check', 'laserLedges', 'brute', 'doubleAlley', 'chipRoof', 'turretPit', 'droneSwarm', 'secretPit', 'gauntlet', 'exit'], tips: [{ seg: 1, dx: 2, key: 'tipLaser' }] },
  { district: 3, index: 1, boss: false, par: 115, segs: ['startK', 'doubleNest', 'cablesHigh', 'teleYard', 'ambush', 'check', 'laserLedges', 'bridge', 'bruteDuo', 'doubleAlley', 'fallingLong', 'droneSwarm', 'lootHeart', 'secretHigh', 'gauntlet', 'mixed', 'exit'] },
  { district: 3, index: 2, boss: false, par: 150, segs: ['start', 'lasers', 'steam', 'doubleNest', 'ambush', 'check', 'door', 'gdrones', 'teleYard', 'droneSwarm', 'laserLedges', 'bruteDuo', 'doubleAlley', 'cannonYard', 'secretHigh', 'chipRoof', 'secretPit', 'gauntlet', 'exit'] },
  { district: 3, index: 3, boss: true, par: 90, segs: ['arenaSpire'] },
];

function build(r: Raw): LevelDef {
  const cols: string[][] = Array.from({ length: ROWS }, () => []);
  const starts: number[] = [];
  let x = 0;
  for (const id of r.segs) {
    const seg = S[id];
    const w = Math.max(...seg.map((row) => row.length));
    if (seg.length > ROWS) throw new Error(`segment ${id} is too tall`);
    starts.push(x);
    for (let y = 0; y < ROWS; y++) {
      const row = seg[seg.length - 1 - y] ?? '';
      cols[y].push(row.padEnd(w));
    }
    x += w;
  }
  const rows = cols.map((c) => c.join('')).reverse();
  const tipsX = (r.tips ?? []).map((tp) => ({ x: starts[tp.seg] + tp.dx, key: tp.key }));
  return { ...r, id: `${r.district + 1}-${r.index + 1}`, rows, tipsX, width: x };
}

export const LEVELS: LevelDef[] = RAW.map(build);
export const levelIndex = (district: number, index: number): number => district * 4 + index;
export const DISTRICT_LEVELS = 4;

/** Checks the hand-made data (run by the balance script and in development). */
export function checkLevels(): string[] {
  const out: string[] = [];
  for (const L of LEVELS) {
    const all = L.rows.join('');
    const n = (ch: string) => all.split(ch).length - 1;
    if (n('P') !== 1) out.push(`${L.id}: ${n('P')} starts`);
    if (n('X') !== 1) out.push(`${L.id}: ${n('X')} exits`);
    if (!L.boss && n('c') !== 3) out.push(`${L.id}: ${n('c')} chips`);
    if (L.boss && n('M') !== 1) out.push(`${L.id}: no boss`);
  }
  return out;
}
