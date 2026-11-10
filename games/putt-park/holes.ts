// The 18 holes: two nine-hole courses, one new idea per hole. Every hole was played at or under
// par by the bot (bot.ts). Map tokens: `<code><rot>[^level][*]` (see kit.ts), north first; the
// tee is marked with *, `.` is empty ground.
import type { HoleDef } from './kit';

export const MEADOW: HoleDef[] = [
  {
    name: { tr: 'İlk Vuruş', en: 'First Putt' }, par: 2,
    tip: { tr: 'Düz bir yol: gücü iyi ayarla.', en: 'A straight lane: judge the power.' },
    map: [
      'hr0',
      's0',
      's0',
      's0',
      'e2*',
    ],
  },
  {
    name: { tr: 'Dirsek', en: 'Dogleg' }, par: 3,
    tip: { tr: 'Duvardan sektirerek köşeyi dön.', en: 'Bank it off the walls round the bend.' },
    map: [
      '.   .   hr0',
      '.   .   s0',
      'rc0 s1  rc2',
      's0  .   .',
      'e2* .   .',
    ],
    water: [[1.6, 3.4, 3.2, 4.8]],
  },
  {
    name: { tr: 'Tümsekli Yol', en: 'Bumpy Lane' }, par: 2,
    tip: { tr: 'Tümsekler topu yana iter.', en: 'The bumps push the ball aside.' },
    map: [
      'hr0',
      'bw0',
      'hl0',
      'bw0',
      's0',
      'e2*',
    ],
  },
  {
    name: { tr: 'Rampa', en: 'The Ramp' }, par: 3,
    tip: { tr: 'Yokuşu çıkacak kadar sert vur, ama fazla değil.', en: 'Hit hard enough to climb, but not too hard.' },
    map: [
      'c0^1 s1^1 hr1^1',
      'ra0  .    .',
      's0   .    .',
      'e2*  .    .',
    ],
  },
  {
    name: { tr: 'Ada', en: 'Island Green' }, par: 2,
    tip: { tr: 'Adanın kenarında duvar yok: suya dikkat!', en: 'No walls round the island: mind the water!' },
    map: [
      'o0 o0  o0',
      'o0 ho0 o0',
      'o0 o0  o0',
      '.  s0  .',
      '.  s0  .',
      '.  e2* .',
    ],
    water: [[-1.6, -1.6, 3.6, 2.5]],
  },
  {
    name: { tr: 'Yel Değirmeni', en: 'The Windmill' }, par: 3,
    tip: { tr: 'Kanatların arasından geçecek anı bekle.', en: 'Wait for a gap between the sails.' },
    windmill: 1.4,
    map: [
      'hr0',
      's0',
      'wm0',
      's0',
      's0',
      'e2*',
    ],
  },
  {
    name: { tr: 'Eğimli Viraj', en: 'Banked Bend' }, par: 3,
    tip: { tr: 'Eğimli köşeler topu döndürür.', en: 'The banked corners carry the ball round.' },
    map: [
      'hc0 s1 hc1',
      's0  .  s0',
      's0  .  hr2',
      'e2* .  .',
    ],
    water: [[0.6, 0.6, 1.4, 3.4]],
  },
  {
    name: { tr: 'Atlama', en: 'Gap Jump' }, par: 3,
    tip: { tr: 'Rampadan hızla çık, boşluğun üstünden uç.', en: 'Hit the ramp fast and fly over the gap.' },
    map: [
      'hr0',
      's0',
      'g0',
      'ra0',
      's0',
      'e2*',
    ],
    water: [[-0.25, 1.7, 0.25, 2.3]],
  },
  {
    name: { tr: 'Çayır Finali', en: 'Meadow Finale' }, par: 4,
    tip: { tr: 'Yukarı, köprüden geç, aşağı ve deliğe.', en: 'Up, over the bridge, down and in.' },
    map: [
      'c0   s1    hr1',
      'ra2  .     .',
      'c3^1 hl1^1 c1^1',
      '.    .     ra0',
      '.    .     bw0',
      '.    .     e2*',
    ],
    water: [[0.6, 0.6, 2.4, 1.4]],
  },
];

export const CASTLE: HoleDef[] = [
  {
    name: { tr: 'Kale Kapısı', en: 'Gatehouse' }, par: 2,
    tip: { tr: 'Kapı dar: daralan yol topu ortaya toplar.', en: 'The gate is narrow: the funnel lines you up.' },
    map: [
      'hr0',
      's0',
      'ca0',
      'ns0',
      's0',
      'e2*',
    ],
  },
  {
    name: { tr: 'İkiz Tüneller', en: 'Twin Tunnels' }, par: 3,
    tip: { tr: 'Tünellerden birini seç.', en: 'Pick a tunnel.' },
    map: [
      'c0  s1 hr1',
      's0  .  .',
      'td0 .  .',
      's0  .  .',
      'e2* .  .',
    ],
  },
  {
    name: { tr: 'Hendek', en: 'The Moat' }, par: 3,
    tip: { tr: 'Dik rampa: hendeği aşmak için tam güç.', en: 'A steep ramp: full power to clear the moat.' },
    map: [
      'hr0',
      's0',
      's0',
      '.',
      'rb0',
      's0',
      'e2*',
    ],
    water: [[-1.4, 2.5, 1.4, 3.5]],
  },
  {
    name: { tr: 'Sürgülü Kapılar', en: 'Sliding Gates' }, par: 3,
    tip: { tr: 'Kayan blokların açılmasını bekle.', en: 'Time the sliding blocks.' },
    map: [
      'hr0',
      's0',
      's0',
      's0',
      's0',
      's0',
      'e2*',
    ],
    movers: [
      { kind: 'slider', col: 0, row: 2, axis: 'x', amp: 0.22, speed: 1.6 },
      { kind: 'slider', col: 0, row: 4, axis: 'x', amp: 0.22, speed: 1.6, phase: Math.PI },
    ],
  },
  {
    name: { tr: 'Süpürge', en: 'The Sweeper' }, par: 3,
    tip: { tr: 'Dönen kolun etrafından dolaş.', en: 'Go round the turning arm.' },
    map: [
      '.   hr0 .',
      'c0  wo2 c1',
      'sd0 o0  sd2',
      'c3  wo0 c2',
      '.   s0  .',
      '.   e2* .',
    ],
    movers: [{ kind: 'sweeper', col: 1, row: 2, len: 1.25, speed: 1.1 }],
  },
  {
    name: { tr: 'Surlar', en: 'Ramparts' }, par: 3,
    tip: { tr: 'İki rampa yukarı, surun üstünden geç.', en: 'Two ramps up, then along the wall.' },
    map: [
      'hr0^1 .     .',
      'ra2^1 .     .',
      'c3^2  nb1^2 c1^2',
      '.     .     ra0^1',
      '.     .     ra0',
      '.     .     s0',
      '.     .     e2*',
    ],
    water: [[0.6, 2.6, 1.4, 5.4]],
  },
  {
    name: { tr: 'Elmas Salonu', en: 'Diamond Hall' }, par: 3,
    tip: { tr: 'Engellerden sektirerek yol bul.', en: 'Bank your way past the blocks.' },
    map: [
      '.   hr0 .',
      'c0  wo2 c1',
      'sd0 od0 sd2',
      'sd0 ot0 sd2',
      'c3  wo0 c2',
      '.   s0  .',
      '.   e2* .',
    ],
  },
  {
    name: { tr: 'Kale Değirmeni', en: 'Castle Mill' }, par: 3,
    tip: { tr: 'Değirmeni geç, sonra kapıyı zamanla.', en: 'Through the mill, then time the gate.' },
    windmill: 1.7,
    map: [
      'hr0',
      's0',
      'ra2',
      'wm0^1',
      'ra0',
      's0',
      'e2*',
    ],
    movers: [{ kind: 'slider', col: 0, row: 1, axis: 'x', amp: 0.24, speed: 1.3 }],
  },
  {
    name: { tr: 'Kral Avlusu', en: "King's Court" }, par: 5,
    tip: { tr: 'Tünel, kapı, rampa ve kale: hepsi bir arada.', en: 'Tunnel, gate, ramp and castle: the lot.' },
    map: [
      'hr3^1 s1^1 c1^1',
      '.     .    ca0^1',
      '.     .    ns0^1',
      '.     .    ra0',
      'c0    s1   c2',
      'tw0   .    .',
      'e2*   .    .',
    ],
    movers: [{ kind: 'slider', col: 1, row: 4, axis: 'z', amp: 0.22, speed: 1.2 }],
    water: [[-0.4, 0.6, 1.4, 3.4]],
  },
];

export const HOLES: HoleDef[] = [...MEADOW, ...CASTLE];
