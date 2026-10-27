// Pixel pictures (verified line-solvable). '.' = empty, letters = colour of a filled cell.
export interface Puzzle { name: { tr: string; en: string }; rows: string[] }
export const PALETTE: Record<string, number> = {
  r: 0xe8413c, w: 0xf3f2f2, y: 0xffd23f, n: 0x8a5a2b, k: 0x3a3440, p: 0xff8fb8,
  b: 0x3e8ef0, g: 0x3fbf4f, s: 0x9aa4b4, o: 0xff9a2e, l: 0x5fd0ff,
};
export const PUZZLES: Puzzle[] = [
  { name: { tr: 'Kalp', en: 'Heart' }, rows: ['.r.r.', 'rrrrr', 'rrrrr', '.rrr.', '..r..'] },
  { name: { tr: 'Mantar', en: 'Mushroom' }, rows: ['.rrr.', 'rrwrr', 'rrrrr', '..w..', '.www.'] },
  { name: { tr: 'Ev', en: 'House' }, rows: ['..r..', '.rrr.', 'rrrrr', '.yny.', '.yny.'] },
  { name: { tr: 'Yıldız', en: 'Star' }, rows: ['..y..', 'yyyyy', '.yyy.', '.y.y.', 'y...y'] },
  { name: { tr: 'Kedi', en: 'Cat' }, rows: ['k......k', 'kk....kk', 'kkkkkkkk', 'k.kkkk.k', 'kkkkkkkk', 'kkkppkkk', '.kkkkkk.', '..kkkk..'] },
  { name: { tr: 'Balık', en: 'Fish' }, rows: ['...bb...', '.bbbbb.b', 'bb.bbbbb', 'bbbbbbbb', 'bbbbbbbb', '.bbbbb.b', '...bb...', '........'] },
  { name: { tr: 'Ağaç', en: 'Tree' }, rows: ['...gg...', '..gggg..', '.gggggg.', 'gggggggg', '.gggggg.', '...nn...', '...nn...', '..nnnn..'] },
  { name: { tr: 'Robot', en: 'Robot' }, rows: ['...ss...', '.ssssss.', '.s.ss.s.', '.ssssss.', '.s....s.', '.ssssss.', '..s..s..', '.ss..ss.'] },
  { name: { tr: 'Dev Mantar', en: 'Big Mushroom' }, rows: ['...rrrr...', '.rrwrrrrr.', 'rrwwrrrwrr', 'rrrrrrwwrr', 'rwrrrrrrrr', '.rrrrrrrr.', '...wwww...', '...wwww...', '...wwww...', '..wwwwww..'] },
  { name: { tr: 'Roket', en: 'Rocket' }, rows: ['....rr....', '...rwwr...', '...wwww...', '...wbbw...', '...wbbw...', '...wwww...', '..rwwwwr..', '.rrwwwwrr.', '.rr.oo.rr.', '....oo....'] },
  { name: { tr: 'Ördek', en: 'Duck' }, rows: ['...yyy....', '..yy.yy...', '..yyyyyoo.', '...yyyy...', '....yy....', '.y..yyyy..', '.yyyyyyyy.', '.yyyyyyyy.', '..yyyyyy..', '..........'] },
  { name: { tr: 'Gemi', en: 'Ship' }, rows: ['....k.....', '....ww....', '....www...', '....wwww..', '....wwwww.', '....k.....', 'nnnnnnnnnn', '.nnnnnnnn.', '..nnnnnn..', 'llllllllll'] },
];
