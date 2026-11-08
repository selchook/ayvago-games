// Okey rule checks, run with: npx tsx games/okey/logic.test.ts
// No test runner: each check prints ok/FAIL and the run throws at the end when one failed.
import { makeTiles, winKind, findFinish, handPoints, okeySpare, pairCount, deal, botDiscard, botTakesDiscard, rng, type Tile } from './logic';

const tiles: Tile[] = makeTiles();
const C = 'RYBK';
/** 'R7' is the first red 7; 'R7b' the second copy; '*' a false joker; '**' the other one. */
const T = (s: string): number => {
  if (s === '*' || s === '**') return tiles.filter((t) => t.num === 0)[s.length - 1].id;
  const second = s.endsWith('b');
  const body = second ? s.slice(0, -1) : s;
  const c = C.indexOf(body[0]), n = Number(body.slice(1));
  return tiles.filter((t) => t.color === c && t.num === n)[second ? 1 : 0].id;
};
const H = (s: string): number[] => s.split(/\s+/).filter(Boolean).map(T);

let failed = 0;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${msg}`);
  if (!cond) failed++;
};

// The okey in these tests is the red 6 (indicator: red 5).
const okey = { color: 0, num: 6 };

// 14 tiles that finish on their own: R1-R2-R3, Y5-B5-K5, B9..B12, K7..K10
const base = 'R1 R2 R3 Y5 B5 K5 B9 B10 B11 B12 K7 K8 K9 K10';
check(winKind(H(base), tiles, okey) === 'normal', 'sets and runs finish');

// 1. the okey is spare: 14 finished tiles + the okey → the okey must be thrown, ×2
{
  const hand = H(base + ' R6');
  const f = findFinish(hand, tiles, okey);
  check(!!f && f.withOkey && f.discard === T('R6'), 'spare okey: the finish throws the okey');
  check(!!f && f.points === 4 && handPoints(f.kind, f.withOkey) === 4, 'spare okey: the hand scores ×2 (4 points)');
  check(okeySpare(hand, tiles, okey), 'okeySpare is true');
  // the player picked another finishing tile? there is none here, but `prefer` must not win over the okey
  const g = findFinish(hand, tiles, okey, T('K10'));
  check(!!g && g.withOkey, 'a preferred plain tile never beats throwing the spare okey');
}

// 2. a spare okey and a stray tile: throwing the stray finishes too, but the okey scores more
{
  // R6 fills R1-R2-R3-(R4): the run R1..R3 + okey as R4 also works, so either the okey or Y13 can go
  const hand = H('R1 R2 R3 Y5 B5 K5 B9 B10 B11 B12 K7 K8 K9 K10 R6');
  const f = findFinish(hand, tiles, okey);
  check(!!f && f.withOkey, 'okey spare (it could also extend a run): it is thrown');
}

// 3. the okey is needed: it fills a gap, so the finish throws another tile and scores 2
{
  const hand = H('R1 R6 R3 Y5 B5 K5 B9 B10 B11 B12 K7 K8 K9 K10 Y13');
  const f = findFinish(hand, tiles, okey);
  check(!!f && !f.withOkey && f.discard === T('Y13'), 'okey needed for R1-?-R3: Y13 is thrown');
  check(!!f && f.points === 2, 'okey needed: 2 points');
  check(!okeySpare(hand, tiles, okey), 'okeySpare is false');
}

// 4. two okeys: one fills a gap, the other is spare → throw the spare one, ×2
{
  const hand = H('R1 R6 R3 Y5 B5 K5 B9 B10 B11 B12 K7 K8 K9 K10 R6b');
  const f = findFinish(hand, tiles, okey);
  check(!!f && f.withOkey, 'two okeys, one spare: an okey is thrown');
}

// 5. the false joker is not wild: throwing it is a plain finish
{
  const hand = H(base + ' *');
  const f = findFinish(hand, tiles, okey);
  check(!!f && !f.withOkey && f.discard === T('*') && f.points === 2, 'false joker thrown: plain finish, 2 points');
}

// 6. seven pairs: 4 points; with a spare okey on top: 8 points
{
  const pairs = 'R1 R1b Y4 Y4b B9 B9b K13 K13b R11 R11b Y2 Y2b B3 B3b';
  check(winKind(H(pairs), tiles, okey) === 'pairs', 'seven pairs finish');
  check(pairCount(H(pairs), tiles, okey) === 7, 'seven pairs counted');
  const f = findFinish(H(pairs + ' R6'), tiles, okey);
  check(!!f && f.kind === 'pairs' && f.withOkey && f.points === 8, 'seven pairs + spare okey: 8 points');
  // the okey completing a pair is needed
  const g = findFinish(H('R1 R6 Y4 Y4b B9 B9b K13 K13b R11 R11b Y2 Y2b B3 B3b K1'), tiles, okey);
  check(!!g && g.kind === 'pairs' && !g.withOkey && [T('K1'), T('R1')].includes(g.discard) && g.points === 4, 'okey completes a pair: a single (K1 or R1) is thrown, 4 points');
}

// 7. a hand that is both runs and pairs scores as pairs
{
  const both = 'R1 R1b R2 R2b R3 R3b Y7 Y7b Y8 Y8b Y9 Y9b K4 K4b';
  check(winKind(H(both), tiles, okey) === 'pairs', 'runs that are also pairs score as pairs');
}

// 8. no finish
{
  const hand = H('R1 R2 R4 Y5 B5 K7 B9 B10 B12 B13 K7b K8 K11 K10 Y1');
  check(findFinish(hand, tiles, okey) === null, 'no finish in a scattered hand');
}

// 9. 12-13-1 is a run, 13-1-2 is not
check(winKind(H('Y12 Y13 Y1 R1 R2 R3 Y5 B5 K5 K7 K8 K9 K10 K11'), tiles, okey) === 'normal', '12-13-1 is a run');
check(winKind(H('Y13 Y1 Y2 R1 R2 R3 Y5 B5 K5 K7 K8 K9 K10 K11'), tiles, okey) === null, '13-1-2 is not a run');

// 10. bots: every finish a bot makes keeps the rule (play many seeded hands)
{
  let finishes = 0, okeyFinishes = 0, wrong = 0;
  for (let g = 0; g < 40; g++) {
    const d = deal(2000 + g, g % 4);
    const hands = d.hands.map((h) => [...h]);
    const pile = [...d.pile];
    const discards: number[][] = [[], [], [], []];
    const r = rng(g);
    let turn = d.dealer, first = true;
    for (let step = 0; step < 400; step++) {
      const h = hands[turn];
      if (!first) {
        const prev = (turn + 3) % 4, top = discards[prev].at(-1);
        if (top !== undefined && botTakesDiscard(h, top, tiles, d.okey)) h.push(discards[prev].pop()!);
        else if (pile.length) h.push(pile.pop()!);
        else break;
      }
      first = false;
      const fin = findFinish(h, tiles, d.okey);
      if (fin) {
        finishes++;
        if (fin.withOkey) okeyFinishes++;
        // whenever some okey finish exists, the bot's finish must be one
        const okeyIds = h.filter((id) => { const t = tiles[id]; return t.color === d.okey.color && t.num === d.okey.num; });
        const okeyWorks = okeyIds.some((id) => winKind(h.filter((x) => x !== id), tiles, d.okey));
        if (okeyWorks && !fin.withOkey) wrong++;
        break;
      }
      const out = botDiscard(h, tiles, d.okey, r);
      h.splice(h.indexOf(out), 1);
      discards[turn].push(out);
      turn = (turn + 1) % 4;
    }
  }
  console.log(`      bots: ${finishes}/40 hands finished, ${okeyFinishes} with the okey`);
  check(wrong === 0, 'bots always throw a spare okey to finish');
}

if (failed) throw new Error(`${failed} okey check(s) failed`);
console.log('all okey checks passed');
