// Trap Trail: the twenty stages, five in each of the four worlds. Each is a run of segments
// (builder.ts) chosen and tuned by hand: a world teaches its traps one at a time, then mixes them;
// later stages are longer, the traps faster and the gaps wider. Every stage has three stars (one
// usually on a side isle or over a trap), gems, at least one checkpoint and from 1-3 on a key and a
// chest.
import { Builder } from './builder';
import { WORLD_IDS, type WorldId } from './defs';
import type { Course } from './course';

export const STAGES_PER_WORLD = 5;
export const STAGE_COUNT = WORLD_IDS.length * STAGES_PER_WORLD;

export const worldOf = (n: number): WorldId => WORLD_IDS[Math.floor((n - 1) / STAGES_PER_WORLD)];
export const inWorldOf = (n: number): number => ((n - 1) % STAGES_PER_WORLD) + 1;

type Writer = (b: Builder) => void;

const STAGES: Writer[] = [
  // ---------------------------------------------------------------- 1 Meadow Isles
  // 1-1 First Steps: walking, jumping, a bridge, a side isle
  (b) => {
    b.start();
    b.walk(8, 4.4);
    b.foe('crab', { range: 1.2 });
    b.bonus(2, 3);
    b.gapTo(2.2, 0, 6);
    b.sideIsle(1, { star: 0 }, { dy: 0.4 });
    b.gapTo(2.6, 0.6, 5);
    b.hops(3, 2.2, 2.8, [0, 0.4, -0.4], [0.8, -0.8, 0]);
    b.checkpoint();
    b.gem('green', b.x - 1.2, b.y, b.z + 3);
    b.bridge();
    b.gapTo(2.6, 0, 5, 4, 0);
    b.star(1, b.x, b.y + 1.4, b.z + 6.5);
    b.walk(4);
    b.sideIsle(-1, { star: 2 }, { dy: 1.2, dist: 5.4 });
    b.heart(b.x + 1.2, b.y, b.z + 1.5, true);
    b.goal();
  },
  // 1-2 Saw Meadow: blades crossing, then blades sliding
  (b) => {
    b.start();
    b.walk(8, 5);
    b.foe('crab');
    b.sawCross(8, 1, { period: 3.2 });
    b.gapTo(2.4, 0, 4);
    b.sawCross(10, 2, { period: 2.9, star: 0 });
    b.checkpoint();
    b.power('thunder', b.x, b.y, b.z + 2);
    b.sawSlide(11, { period: 3.2 });
    b.gapTo(2.6, 0.5, 4);
    b.sideIsle(-1, { gem: 'blue' }, { dy: 0.8 });
    b.hops(2, 2.5, 2.8, [0, 0], [1, -1]);
    b.sawCross(12, 3, { period: 2.6 });
    b.star(1, b.x - 1.8, b.y, b.z + 6);
    b.walk(7, 5);
    b.foe('crab');
    b.sideIsle(1, { star: 2 }, { dy: 1.4 });
    b.goal();
  },
  // 1-3 Spring Hill: springs, stairs, the first key and chest
  (b) => {
    b.start();
    b.walk(6, 4.4);
    b.bonus(2, 2.6);
    b.bounceUp(3.4, 6);
    b.sideIsle(1, { key: true }, { dy: 0.6 });
    b.hops(2, 2.4, 3, [-0.8, -0.8], [0.8, -0.8]);
    b.stairsUp(6);
    b.checkpoint();
    b.power('spring', b.x, b.y, b.z + 2);
    b.bounceUp(3.6, 5);
    b.star(0, b.x, b.y + 2.6, b.z + 7);
    b.gapTo(2.6, -1.2, 5);
    b.chest({ coins: 14, gem: 'green' });
    b.walk(7, 5);
    b.foe('skull');
    b.sawCross(8, 1, { period: 3 });
    b.sideIsle(-1, { star: 1 }, { dy: 2.2, dist: 5 });
    b.gapTo(2.6, 0, 5);
    b.bounceUp(3.2, 5);
    b.star(2, b.x + 1.4, b.y, b.z + 2);
    b.goal();
  },
  // 1-4 Spike Rhythm: traps rising in waves and in a checker
  (b) => {
    b.start();
    b.walk(7, 5);
    b.foe('crab');
    b.traps(3, 3, { period: 2.6, pattern: 'all' });
    b.gapTo(2.4, 0, 4);
    b.traps(4, 3, { period: 2.6, pattern: 'wave', star: 0 });
    b.power('shield', b.x, b.y, b.z + 1.8);
    b.checkpoint();
    b.spikeRun(12, 4);
    b.sideIsle(1, { key: true }, { dy: 0.8 });
    b.hops(3, 2.4, 2.6, [0.4, 0, -0.4], [0, 1, -1]);
    b.traps(4, 4, { period: 2.2, pattern: 'checker' });
    b.sideIsle(-1, { star: 1 }, { dy: 0.5, trap: true });
    b.checkpoint();
    b.chest({ coins: 14, heart: true });
    b.walk(6, 5);
    b.foe('crab');
    b.traps(5, 3, { period: 2.2, pattern: 'wave' });
    b.star(2, b.x, b.y, b.z + 1.5);
    b.gem('blue', b.x - 1.4, b.y, b.z + 1.5);
    b.goal();
  },
  // 1-5 Meadow Gate: the meadow's traps together and the first lever gate
  (b) => {
    b.start();
    b.walk(7, 5);
    b.foe('gob');
    b.bonus(1, 2.6);
    b.sawCross(9, 2, { period: 2.6 });
    b.bounceUp(3.4, 5);
    b.traps(3, 3, { period: 2.3, pattern: 'wave' });
    b.checkpoint();
    b.leverGate({ side: -1 });
    b.sideIsle(1, { star: 0 }, { dy: 1.6 });
    b.bridge();
    b.sawSlide(10, { period: 2.8 });
    b.sideIsle(-1, { key: true }, { dy: 0.6 });
    b.checkpoint();
    b.hops(3, 2.6, 2.6, [0.5, 0.5, -1], [-1, 1, 0]);
    b.star(1, b.x, b.y + 1.2, b.z + 4);
    b.spikeRun(10, 4);
    b.chest({ coins: 16, gem: 'pink' });
    b.walk(7, 5);
    b.foe('skull');
    b.traps(3, 3, { period: 2.0, pattern: 'checker', star: 2 });
    b.goal();
  },
  // ---------------------------------------------------------------- 2 Canyon Fort
  // 2-1 Cannon Pass: cannons across the path, then one down it
  (b) => {
    b.start();
    b.walk(7, 5);
    b.foe('gob');
    b.cannonCross(12, 2, { every: 2.8 });
    b.gapTo(2.4, 0, 4);
    b.sideIsle(1, { star: 0 }, { dy: 0.6 });
    b.cannonCross(16, 3, { every: 2.5 });
    b.checkpoint();
    b.cannonHead(16, { every: 2.4 });
    b.sideIsle(-1, { key: true }, { dy: 0.8 });
    b.gapTo(2.6, 0.4, 4);
    b.hops(2, 2.6, 2.8, [0.4, 0], [1, -1]);
    b.cannonCross(14, 3, { every: 2.2, star: 1 });
    b.chest({ coins: 16, gem: 'blue' });
    b.walk(8, 5);
    b.foe('skull', { dz: 1.5 });
    b.foe('crab', { dz: -1.5 });
    b.gem('green', b.x, b.y, b.z + 2);
    b.sawCross(8, 1, { period: 2.6 });
    b.star(2, b.x + 1.6, b.y, b.z + 1.5);
    b.goal();
  },
  // 2-2 Roller Canyon: spiked logs down the lanes
  (b) => {
    b.start();
    b.walk(7, 5);
    b.foe('skull');
    b.bonus(2, 2.6);
    b.rollers(14, { every: 2.6, speed: 3.8 });
    b.gapTo(2.4, 0, 4);
    b.sideIsle(-1, { star: 0 }, { dy: 1 });
    b.rollers(18, { every: 2.2, speed: 4.2, star: 1 });
    b.checkpoint();
    b.power('magnet', b.x, b.y, b.z + 2);
    b.cannonCross(12, 2, { every: 2.6 });
    b.sideIsle(1, { key: true }, { dy: 0.6 });
    b.hops(3, 2.5, 2.6, [0.5, 0.5, 0], [-1, 1, 0]);
    b.rollers(16, { every: 1.9, speed: 4.6 });
    b.chest({ coins: 16, heart: true });
    b.walk(7, 5);
    b.foe('gob');
    b.sideIsle(-1, { star: 2 }, { dy: 2, dist: 5 });
    b.gem('blue', b.x + 1.3, b.y, b.z + 2);
    b.goal();
  },
  // 2-3 Fuse Alley: bombs that light as you pass and pipes that drop them
  (b) => {
    b.start();
    b.walk(7, 5);
    b.foe('crab');
    b.bombRun(12, 3);
    b.gapTo(2.4, 0, 4);
    b.sideIsle(1, { star: 0 }, { dy: 0.8 });
    b.droppers(14, 3, { every: 2.6 });
    b.checkpoint();
    b.power('thunder', b.x, b.y, b.z + 2);
    b.bombRun(14, 4);
    b.rollers(12, { every: 2.4, speed: 4 });
    b.sideIsle(-1, { key: true }, { dy: 0.6 });
    b.checkpoint();
    b.droppers(16, 4, { every: 2.2 });
    b.star(1, b.x, b.y, b.z + 8);
    b.chest({ coins: 18, gem: 'blue' });
    b.walk(8, 5);
    b.foe('gob', { dz: 1.5 });
    b.foe('skull', { dz: -1.5 });
    b.bombRun(10, 3);
    b.sideIsle(1, { star: 2 }, { dy: 1.6 });
    b.gem('green', b.x, b.y, b.z + 2);
    b.goal();
  },
  // 2-4 Pipe Drop: pipe pillars over the void, bombs from above
  (b) => {
    b.start();
    b.walk(7, 5);
    b.foe('skull');
    b.bonus(1, 2.6);
    b.pipes([0, 0.6, 0.6, -0.6], { dxs: [0, 1, -1, 0] });
    b.sideIsle(-1, { star: 0 }, { dy: 1.4 });
    b.droppers(12, 3, { every: 2.4 });
    b.checkpoint();
    b.pipes([0.8, 0.8, 0, -0.8, -0.8], { dxs: [1.2, -1.2, 1.2, -1.2, 0] });
    b.star(1, b.x, b.y + 1.5, b.z + 7);
    b.cannonCross(12, 2, { every: 2.3 });
    b.sideIsle(1, { key: true }, { dy: 0.8 });
    b.checkpoint();
    b.bombRun(12, 4);
    b.chest({ coins: 18, gem: 'pink' });
    b.walk(7, 5);
    b.foe('gob');
    b.pipes([0.6, 0.6, -1.2], { dxs: [-1, 1, 0] });
    b.sideIsle(-1, { star: 2 }, { dy: 1.2 });
    b.goal();
  },
  // 2-5 Fort Gate: the canyon's traps together, a lever gate under fire
  (b) => {
    b.start();
    b.walk(7, 5);
    b.foe('gob');
    b.cannonCross(12, 2, { every: 2.2 });
    b.rollers(14, { every: 2, speed: 4.4 });
    b.checkpoint();
    b.leverGate({ side: 1, guard: 'saw' });
    b.sideIsle(-1, { star: 0 }, { dy: 1.2 });
    b.droppers(14, 3, { every: 2.1 });
    b.checkpoint();
    b.power('shield', b.x, b.y, b.z + 2);
    b.cannonHead(16, { every: 2 });
    b.sideIsle(1, { key: true }, { dy: 1 });
    b.pipes([0.6, 0.6, 0], { dxs: [1, -1, 0] });
    b.star(1, b.x, b.y + 1.8, b.z + 5.5);
    b.bombRun(12, 4);
    b.chest({ coins: 20, gem: 'blue' });
    b.walk(8, 5);
    b.foe('gob', { dz: 1.5 });
    b.foe('skull', { dz: -1.5 });
    b.rollers(12, { every: 1.8, speed: 4.8, star: 2 });
    b.goal();
  },
  // ---------------------------------------------------------------- 3 Frost Peaks
  // 3-1 Ice Steps: sliding floors with saws
  (b) => {
    b.start();
    b.walk(7, 5);
    b.foe('bee');
    b.bonus(2, 2.6);
    b.ice(10);
    b.gapTo(2.4, 0, 5, 4.4, 0, { surf: 'ice' });
    b.sideIsle(1, { star: 0 }, { dy: 0.6 });
    b.hops(3, 2.4, 2.8, [0.4, 0.4, 0], [1, -1, 0], { surf: 'ice' });
    b.checkpoint();
    b.sawCross(10, 2, { period: 2.6 });
    b.ice(12);
    b.sideIsle(-1, { key: true }, { dy: 0.6 });
    b.sawSlide(10, { period: 2.6 });
    b.checkpoint();
    b.chest({ coins: 18, gem: 'blue' });
    b.walk(8, 5);
    b.foe('bee', { dz: 1.5 });
    b.foe('skull', { dz: -1.5 });
    b.hops(3, 2.6, 2.6, [0.6, 0.6, -0.6], [-1, 1, 0], { surf: 'ice' });
    b.star(1, b.x, b.y + 1.3, b.z + 5);
    b.ice(10);
    b.sideIsle(1, { star: 2 }, { dy: 1.6 });
    b.goal();
  },
  // 3-2 Swinging Spikes: pendulums over plank bridges
  (b) => {
    b.start();
    b.walk(7, 5);
    b.foe('bee');
    b.pendulums(3, { period: 2.6 });
    b.sideIsle(-1, { star: 0 }, { dy: 1 });
    b.gapTo(2.4, 0, 4);
    b.pendulums(4, { period: 2.4, star: 1 });
    b.checkpoint();
    b.power('spring', b.x, b.y, b.z + 2);
    b.ice(8);
    b.sawCross(8, 2, { period: 2.4 });
    b.sideIsle(1, { key: true }, { dy: 1.2 });
    b.checkpoint();
    b.pendulums(5, { period: 2.2 });
    b.chest({ coins: 18, heart: true });
    b.walk(8, 5);
    b.foe('bee', { dz: 1.5 });
    b.foe('gob', { dz: -1.5 });
    b.traps(3, 3, { period: 2.2, pattern: 'wave' });
    b.sideIsle(-1, { star: 2 }, { dy: 1.6 });
    b.gem('pink', b.x, b.y, b.z + 2);
    b.goal();
  },
  // 3-3 Floating Floes: moving platforms
  (b) => {
    b.start();
    b.walk(7, 5);
    b.foe('bee');
    b.bonus(1, 2.6);
    b.movers(2, 'x', { period: 3.6 });
    b.sideIsle(1, { star: 0 }, { dy: 0.8 });
    b.movers(1, 'z', { period: 3.4 });
    b.movers(1, 'x', { period: 3.2 });
    b.checkpoint();
    b.movers(3, 'y', { period: 3, amp: 2 });
    b.star(1, b.x, b.y + 1.6, b.z + 7);
    b.ice(8);
    b.sideIsle(-1, { key: true }, { dy: 0.6 });
    b.checkpoint();
    b.movers(3, 'x', { period: 3, amp: 2.6 });
    b.pendulums(2, { period: 2.4 });
    b.chest({ coins: 20, gem: 'blue' });
    b.walk(8, 5);
    b.foe('skull', { dz: 1.5 });
    b.foe('bee', { dz: -1.5 });
    b.movers(1, 'z', { period: 2.8 });
    b.sideIsle(1, { star: 2 }, { dy: 1.4 });
    b.goal();
  },
  // 3-4 Crumble Cliffs: floes that drop
  (b) => {
    b.start();
    b.walk(7, 5);
    b.foe('gob');
    b.crumbles(3, { dxs: [0, 1, -1] });
    b.sideIsle(-1, { star: 0 }, { dy: 0.8 });
    b.sawCross(8, 2, { period: 2.4 });
    b.checkpoint();
    b.power('thunder', b.x, b.y, b.z + 2);
    b.crumbles(4, { dxs: [1, -1, 1, -1], gap: 2.1 });
    b.ice(8);
    b.sideIsle(1, { key: true }, { dy: 0.8 });
    b.checkpoint();
    b.movers(2, 'x', { period: 3 });
    b.crumbles(4, { size: 2.2, gap: 2.2, dxs: [0, 1.2, 0, -1.2] });
    b.star(1, b.x, b.y + 1.4, b.z + 9);
    b.chest({ coins: 20, gem: 'pink' });
    b.walk(8, 5);
    b.foe('bee', { dz: 1.5 });
    b.foe('skull', { dz: -1.5 });
    b.pendulums(3, { period: 2.2 });
    b.sideIsle(-1, { star: 2 }, { dy: 1.8 });
    b.goal();
  },
  // 3-5 Frozen Vault: the frost's traps together, a lever gate on ice
  (b) => {
    b.start();
    b.walk(7, 5);
    b.foe('bee');
    b.ice(8);
    b.pendulums(3, { period: 2.2 });
    b.checkpoint();
    b.leverGate({ side: -1, guard: 'saw' });
    b.sideIsle(1, { star: 0 }, { dy: 1.6 });
    b.movers(2, 'x', { period: 2.8, amp: 2.6 });
    b.crumbles(3, { dxs: [1, -1, 0] });
    b.checkpoint();
    b.power('shield', b.x, b.y, b.z + 2);
    b.sawSlide(12, { period: 2.4 });
    b.sideIsle(-1, { key: true }, { dy: 1 });
    b.ice(10);
    b.star(1, b.x + 1.4, b.y, b.z + 3);
    b.checkpoint();
    b.traps(4, 3, { period: 2, pattern: 'wave' });
    b.chest({ coins: 22, gem: 'blue', heart: true });
    b.walk(8, 5);
    b.foe('gob', { dz: 1.5 });
    b.foe('bee', { dz: -1.5 });
    b.movers(2, 'y', { period: 2.6, amp: 2 });
    b.pendulums(3, { period: 2, star: 2 });
    b.goal();
  },
  // ---------------------------------------------------------------- 4 Storm Keep
  // 4-1 Storm Gate: spinning columns and a gate
  (b) => {
    b.start();
    b.walk(8, 5);
    b.foe('gob', { dz: 1.5 });
    b.foe('crab', { dz: -1.5 });
    b.bonus(2, 2.6);
    b.pillars(12, 4);
    b.sideIsle(1, { star: 0 }, { dy: 1 });
    b.cannonCross(12, 2, { every: 2.2 });
    b.checkpoint();
    b.leverGate({ side: 1, guard: 'saw' });
    b.pillars(14, 5);
    b.sideIsle(-1, { key: true }, { dy: 1 });
    b.checkpoint();
    b.traps(4, 3, { period: 2, pattern: 'checker', star: 1 });
    b.chest({ coins: 22, gem: 'blue' });
    b.walk(8, 5);
    b.foe('bee', { dz: 1.5 });
    b.foe('skull', { dz: -1.5 });
    b.rollers(14, { every: 1.9, speed: 4.6 });
    b.sideIsle(1, { star: 2 }, { dy: 1.8 });
    b.goal();
  },
  // 4-2 Thunder Run: Thunder breaks logs, balls and bombs
  (b) => {
    b.start();
    b.walk(7, 5);
    b.foe('gob');
    b.power('thunder', b.x, b.y, b.z + 2);
    b.rollers(16, { every: 1.7, speed: 4.8 });
    b.bombRun(10, 3);
    b.sideIsle(-1, { star: 0 }, { dy: 1.2 });
    b.checkpoint();
    b.power('thunder', b.x, b.y, b.z + 2);
    b.cannonCross(16, 4, { every: 1.9 });
    b.droppers(12, 3, { every: 2 });
    b.sideIsle(1, { key: true }, { dy: 1 });
    b.checkpoint();
    b.cannonHead(16, { every: 1.9 });
    b.star(1, b.x, b.y + 1.2, b.z + 9);
    b.chest({ coins: 22, gem: 'pink' });
    b.walk(8, 5);
    b.foe('gob', { dz: 1.5 });
    b.foe('bee', { dz: -1.5 });
    b.power('thunder', b.x, b.y, b.z + 2);
    b.rollers(14, { every: 1.5, speed: 5.2, star: 2 });
    b.goal();
  },
  // 4-3 Orbit Isles: balls circling posts, moving floes
  (b) => {
    b.start();
    b.walk(8, 5);
    b.foe('bee', { dz: 1.5 });
    b.foe('crab', { dz: -1.5 });
    b.orbits(3, { speed: 1.5 });
    b.sideIsle(1, { star: 0 }, { dy: 1.2 });
    b.movers(2, 'x', { period: 2.8, amp: 2.6 });
    b.checkpoint();
    b.orbits(3, { speed: 1.9, star: 1 });
    b.pillars(10, 3);
    b.sideIsle(-1, { key: true }, { dy: 1 });
    b.checkpoint();
    b.crumbles(3, { dxs: [1, -1, 1] });
    b.orbits(2, { speed: 2.1 });
    b.chest({ coins: 22, gem: 'blue', heart: true });
    b.walk(8, 5);
    b.foe('skull', { dz: 1.5 });
    b.foe('gob', { dz: -1.5 });
    b.movers(1, 'z', { period: 2.6 });
    b.sideIsle(1, { star: 2 }, { dy: 2 });
    b.goal();
  },
  // 4-4 Trap Corridor: everything, quickly
  (b) => {
    b.start();
    b.walk(8, 5);
    b.foe('gob', { dz: 1.5 });
    b.foe('bee', { dz: -1.5 });
    b.bonus(2, 2.6);
    b.sawCross(10, 3, { period: 2.2 });
    b.traps(4, 3, { period: 1.9, pattern: 'wave' });
    b.sideIsle(-1, { star: 0 }, { dy: 1.4 });
    b.checkpoint();
    b.pendulums(4, { period: 2 });
    b.rollers(14, { every: 1.7, speed: 5 });
    b.sideIsle(1, { key: true }, { dy: 1.2 });
    b.checkpoint();
    b.power('shield', b.x, b.y, b.z + 2);
    b.cannonCross(14, 3, { every: 1.9 });
    b.spikeRun(12, 5);
    b.star(1, b.x + 1.6, b.y, b.z + 2);
    b.checkpoint();
    b.droppers(12, 3, { every: 1.9 });
    b.crumbles(3, { dxs: [1, -1, 0] });
    b.chest({ coins: 24, gem: 'pink' });
    b.walk(10, 5);
    b.foe('bee', { dz: 2.5 });
    b.foe('skull');
    b.foe('crab', { dz: -2.5 });
    b.sawSlide(12, { period: 2.2 });
    b.sideIsle(-1, { star: 2 }, { dy: 2 });
    b.goal();
  },
  // 4-5 Keep Summit: the last climb to the storm keep's tower
  (b) => {
    b.start();
    b.walk(8, 5);
    b.foe('gob', { dz: 1.5 });
    b.foe('skull', { dz: -1.5 });
    b.bounceUp(3.4, 5);
    b.pillars(10, 3);
    b.orbits(2, { speed: 2 });
    b.sideIsle(1, { star: 0 }, { dy: 1.4 });
    b.checkpoint();
    b.leverGate({ side: -1, guard: 'saw' });
    b.rollers(14, { every: 1.6, speed: 5 });
    b.movers(2, 'y', { period: 2.6, amp: 2 });
    b.sideIsle(-1, { key: true }, { dy: 1.2 });
    b.checkpoint();
    b.power('thunder', b.x, b.y, b.z + 2);
    b.cannonCross(14, 3, { every: 1.8 });
    b.pendulums(3, { period: 1.9 });
    b.star(1, b.x, b.y + 1.4, b.z + 7);
    b.checkpoint();
    b.chest({ coins: 26, gem: 'pink', heart: true });
    b.walk(8, 5);
    b.foe('gob', { dz: 1.5 });
    b.foe('bee', { dz: -1.5 });
    b.traps(4, 3, { period: 1.8, pattern: 'wave' });
    b.pipes([0.8, 0.8, 0.8], { dxs: [1, -1, 0] });
    b.bounceUp(3.4, 5);
    b.star(2, b.x - 1.6, b.y, b.z + 2);
    b.goal({ tower: true });
  },
];

const cache = new Map<number, number>();

/** Builds stage n (1..20) fresh: every attempt gets its own course to play. */
export function buildStage(n: number): Course {
  const b = new Builder(worldOf(n), n, inWorldOf(n));
  STAGES[n - 1](b);
  return b.c;
}

/** The par time of a stage (seconds), for the time bonus and the map. */
export function parOf(n: number): number {
  let p = cache.get(n);
  if (p === undefined) { p = buildStage(n).par; cache.set(n, p); }
  return p;
}
