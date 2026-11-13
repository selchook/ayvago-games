// Kickflip Park: every string the game shows, in Turkish and English.
import type { Strings } from '@core';

type Pair = [tr: string, en: string];

const S: Record<string, Pair> = {
  // parks
  park_plaza: ['Akçaağaç Meydanı', 'Maple Plaza'],
  park_yard: ['Kereste Avlusu', 'Timber Yard'],
  park_roofs: ['Gökdelen Çatıları', 'Skyline Roofs'],
  parkSub_plaza: ['Okul meydanı: banklar, merdivenler, raylar', 'A schoolyard plaza: benches, stairs, rails'],
  parkSub_yard: ['Ahşap park: U-rampa, havuz, funbox', 'A wooden park: half-pipe, bowl, funbox'],
  parkSub_roofs: ['Çatılar: boşluklar, uzun raylar, rampalar', 'Downtown roofs: gaps, long rails, kickers'],

  // tricks
  tr_kickflip: ['Kickflip', 'Kickflip'],
  tr_heelflip: ['Heelflip', 'Heelflip'],
  tr_shoveit: ['Pop Shove-it', 'Pop Shove-it'],
  tr_varial: ['Varial Flip', 'Varial Flip'],
  tr_nosegrab: ['Burun Tutuşu', 'Nose Grab'],
  tr_tailgrab: ['Kuyruk Tutuşu', 'Tail Grab'],
  tr_melon: ['Melon', 'Melon'],
  tr_indy: ['Indy', 'Indy'],
  tr_fiftyfifty: ['50-50 Grind', '50-50 Grind'],
  tr_nosegrind: ['Burun Grind', 'Nosegrind'],
  tr_fiveo: ['5-0 Grind', '5-0 Grind'],
  tr_boardslide: ['Tahta Kaydırma', 'Boardslide'],
  tr_smith: ['Smith Grind', 'Smith Grind'],
  tr_manual: ['Manuel', 'Manual'],
  tr_nosemanual: ['Burun Manueli', 'Nose Manual'],
  tr_comet: ['Kuyruklu Yıldız', 'Comet Twist'],
  tr_pinwheel: ['Fırıldak', 'Pinwheel'],
  tr_sparkslide: ['Kıvılcım Kayışı', 'Spark Slide'],
  tr_moonwalk: ['Ay Manueli', 'Moon Manual'],
  tr_spin: ['{n} Dönüş', '{n} Spin'],
  tr_double: ['Çift {t}', 'Double {t}'],
  tr_triple: ['Üçlü {t}', 'Triple {t}'],

  // gaps
  gap_planter: ['Saksı Atlayışı', 'Planter Gap'],
  gap_planterBack: ['Saksı Dönüşü', 'Planter Return'],
  gap_stairs: ['Merdiven Atlayışı', 'Stair Set'],
  gap_terraceDrop: ['Teras İnişi', 'Terrace Drop'],
  gap_hipTransfer: ['Tümsek Transferi', 'Hip Transfer'],
  gap_funboxAir: ['Funbox Uçuşu', 'Funbox Air'],
  gap_spine: ['Sırt Transferi', 'Spine Transfer'],
  gap_kickerGap: ['Avlu Atlayışı', 'Yard Gap'],
  gap_alley: ['Ara Sokak Atlayışı', 'Alley Gap'],
  gap_alley2: ['Arka Sokak Atlayışı', 'Back Alley Gap'],
  gap_skylight: ['Çatı Penceresi Atlayışı', 'Skylight Gap'],
  gap_penthouseDrop: ['Çatı Katı İnişi', 'Penthouse Drop'],

  // goals
  goal_score: ['{n} puan topla', 'Score {n} points'],
  goal_combo: ['{n} puanlık bir kombo indir', 'Land a {n}-point combo'],
  goal_tapes: ['Kayıp 5 kaseti bul', 'Find the 5 lost mixtapes'],
  goal_rail_long: ['Uzun Ray\'da {n} sn grind yap', 'Grind the Long Rail for {n} s'],
  goal_manual: ['{n} saniye manuel tut', 'Hold a manual for {n} s'],
  goal_vert: ['U-rampanın {n} m üstüne uç', 'Air {n} m above the half-pipe'],
  goal_spin: ['Bir {n} dönüşle yere in', 'Land a {n} spin'],
  goal_gap_planter: ['Saksıyı atla', 'Clear the Planter Gap'],
  goal_gap_funboxAir: ['Funbox\'ın üstünden uç', 'Fly over the funbox'],
  goal_gap_skylight: ['Çatı penceresini atla', 'Clear the Skylight Gap'],
  goal_rails: ['Tek komboda {n} farklı rayda kay', 'Grind {n} different rails in one combo'],
  goal_special: ['Bir özel hareketle yere in', 'Land a special trick'],

  // landings
  q_perfect: ['MÜKEMMEL!', 'PERFECT!'],
  q_clean: ['TEMİZ', 'CLEAN'],
  q_sketchy: ['SALLANTILI', 'SKETCHY'],

  // the first-session tutorial
  tut_head: ['DERS {n}/4', 'LESSON {n}/4'],
  tut_push_keys: ['İtmek için ↑ ya da W tuşunu basılı tut ve hızlan. ← → ile dön.', 'Hold ↑ or W to push and pick up speed. Steer with ← →.'],
  tut_push_touch: ['Sol başparmakla çubuğu yukarı it ve hızlan; sağa sola çekerek dön.', 'Push the stick up with your left thumb to speed up; steer left and right.'],
  tut_ollie_keys: ['Boşluk tuşunu basılı tut, bırakınca zıpla: ollie!', 'Hold Space and let go to jump: an ollie!'],
  tut_ollie_touch: ['ZIPLA tuşunu basılı tut, bırakınca zıpla: ollie!', 'Hold OLLIE and let go to jump: an ollie!'],
  tut_flip_keys: ['Zıpla, havadayken J tuşuna bas: kickflip! (Oklarla başka flipler)', 'Ollie, then press J in the air: a kickflip! (Arrows pick other flips)'],
  tut_flip_touch: ['Zıpla, havadayken sağ tarafta yukarı kaydır: kickflip!', 'Ollie, then swipe up on the right in the air: a kickflip!'],
  tut_grind_keys: ['Yeşil halkadaki raya ya da banka zıpla, L tuşunu basılı tut: grind!', 'Jump onto the rail or ledge in the green ring and hold L: a grind!'],
  tut_grind_touch: ['Yeşil halkadaki raya zıpla ve ZIPLA tuşunu basılı tutmaya devam et: grind!', 'Jump onto the rail in the green ring and keep holding OLLIE: a grind!'],
  tut_nice: ['GÜZEL!', 'NICE!'],
  tut_done: ['HAZIRSIN!', 'YOU\'RE READY!'],
  tut_doneSub: ['Şimdi hedeflerin peşine düş', 'Now go for the goals'],
  tut_skip: ['ATLA', 'SKIP'],
  tut_skipKey: ['ATLA (X)', 'SKIP (X)'],

  // HUD and banners
  combo: ['KOMBO', 'COMBO'],
  special: ['ÖZEL', 'SPECIAL'],
  specialReady: ['ÖZEL HAZIR!', 'SPECIAL READY!'],
  balance: ['DENGE', 'BALANCE'],
  landed: ['İNDİ!', 'LANDED!'],
  bail: ['DÜŞTÜN!', 'BAILED!'],
  fell: ['ÇATIDAN DÜŞTÜN!', 'OFF THE ROOF!'],
  goalDone: ['HEDEF TAMAM', 'GOAL COMPLETE'],
  tenLeft: ['SON 10 SANİYE!', '10 SECONDS LEFT!'],
  timeUp: ['SÜRE BİTTİ!', 'TIME!'],
  lastTrick: ['Son hareketini indir!', 'Land your last trick!'],
  tapeGot: ['KASET {n}/5', 'MIXTAPE {n}/5'],
  praise0: ['GÜZEL HAT!', 'NICE LINE!'],
  praise1: ['TERTEMİZ!', 'CRISP!'],
  praise2: ['YAĞ GİBİ!', 'BUTTERY!'],
  praise3: ['ALEV ALEV!', 'ON FIRE!'],
  praise4: ['EFSANE!', 'LEGENDARY!'],
  praise5: ['GÖKLERDE!', 'SKY HIGH!'],

  // touch buttons
  btnOllie: ['ZIPLA', 'OLLIE'],
  btnManual: ['MANUEL', 'MANUAL'],
  btnSpecial: ['ÖZEL', 'SPECIAL'],

  // hints
  hintTouch: ['Sol başparmak: yön ve itiş · Büyük tuşa bas, bırakınca zıpla\nHavada sağ tarafta kaydır: flip · kaydırıp tut: tutuş\nRayın yanında tuşu basılı tut: grind · MANUEL komboyu sürdürür', 'Left thumb: steer and push · Hold the big button, let go to ollie\nIn the air swipe on the right: flip · swipe and hold: grab\nHold the button near a rail: grind · MANUAL keeps combos going'],
  hintKeys: ['Oklar / WASD: yön ve itiş · Boşluk: basılı tut, bırakınca zıpla\nJ flip · K tutuş (oklarla çeşit) · L grind ya da manuel\nÖzel çubuk dolunca J+K birlikte: özel hareket', 'Arrows / WASD: steer and push · Space: hold, let go to ollie\nJ flip · K grab (arrows pick which) · L grind or manual\nWhen the special bar is full, J+K together: a special trick'],
  hintSpecial: ['Özel çubuğu doldu! Havada J+K ya da ÖZEL tuşu', 'Special bar full! In the air press J+K or SPECIAL'],
  hintGotIt: ['TAMAM', 'GOT IT'],

  // session end
  sessionOver: ['SEANS BİTTİ', 'SESSION OVER'],
  goalsThis: ['Bu seansta tamamlanan hedefler', 'Goals completed this session'],
  noGoals: ['Bu sefer hedef yok, bir daha dene!', 'No goals this time, have another go!'],
  newPark: ['YENİ PARK AÇILDI: {name}', 'NEW PARK UNLOCKED: {name}'],
  newBoard: ['YENİ KAYKAY AÇILDI: {name}', 'NEW BOARD UNLOCKED: {name}'],
  newBoardTitle: ['YENİ KAYKAY AÇILDI!', 'NEW BOARD UNLOCKED!'],
  sessionTitle: ['{park}', '{park}'],

  // the session setup (PLAY on the menu)
  setupTitle: ['PARKINI VE KAYKAYINI SEÇ', 'PICK YOUR PARK AND BOARD'],
  start: ['BAŞLA', 'START'],
  setupKeys: ['←/→ park · ↑/↓ kaykay · Enter başla · Esc geri', '←/→ park · ↑/↓ board · Enter start · Esc back'],
  lockedShort: ['KİLİTLİ', 'LOCKED'],
  locked: ['KİLİTLİ: {park} parkında {n} hedef tamamla', 'LOCKED: finish {n} goals in {park}'],
  lockedHave: ['Şu ana kadar: {n}/{m} hedef', 'So far: {n}/{m} goals'],
  goalsCount: ['{n}/{m} hedef', '{n}/{m} goals'],
  bestIn: ['En iyi: {n}', 'Best: {n}'],
  board: ['KAYKAY', 'BOARD'],
  back: ['GERİ', 'BACK'],
  rarity_common: ['SIRADAN', 'COMMON'],
  rarity_rare: ['NADİR', 'RARE'],
  rarity_epic: ['DESTANSI', 'EPIC'],
  rarity_legendary: ['EFSANEVİ', 'LEGENDARY'],
  rarity_special: ['ÖZEL', 'SPECIAL'],
  unlock_goals: ['Açmak için {n} hedef tamamla ({have}/{need})', 'Complete {n} goals to unlock ({have}/{need})'],
  unlock_score: ['Açmak için tek seansta {n} puan yap', 'Score {n} in one session to unlock'],
  unlock_tapes: ['Açmak için {n} farklı kaset bul ({have}/{need})', 'Find {n} different mixtapes to unlock ({have}/{need})'],
  unlock_park: ['{park} açılınca gelir: {prev} parkında {n} hedef ({have}/{need})', 'Opens with {park}: {n} goals in {prev} ({have}/{need})'],
  unlock_tapesPark: ['Açmak için bir parktaki 5 kasetin hepsini bul ({have}/{need})', 'Find all 5 mixtapes in one park to unlock ({have}/{need})'],
  boardRiding: ['BU KAYKAYLA KAYIYORSUN', 'YOU RIDE THIS BOARD'],
  boardOpen: ['Açık', 'Unlocked'],
};

export const STRINGS: Partial<Strings> = {
  tr: Object.fromEntries(Object.entries(S).map(([k, v]) => [k, v[0]])),
  en: Object.fromEntries(Object.entries(S).map(([k, v]) => [k, v[1]])),
} as Partial<Strings>;
