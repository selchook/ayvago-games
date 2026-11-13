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
  parkSub_roofs: ['Şehrin tepesi: boşluklar, uzun raylar, rampalar', 'Downtown roofs: gaps, long rails, kickers'],

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
  newDeck: ['YENİ TAHTA: {name}', 'NEW DECK: {name}'],
  newWheel: ['YENİ TEKERLER: {name}', 'NEW WHEELS: {name}'],
  sessionTitle: ['{park}', '{park}'],

  // the park screen
  parks: ['PARKLAR', 'PARKS'],
  parksTitle: ['PARKLAR VE HEDEFLER', 'PARKS & GOALS'],
  skateHere: ['BURADA KAY', 'SKATE HERE'],
  selected: ['SEÇİLİ', 'SELECTED'],
  locked: ['KİLİTLİ: {park} parkında {n} hedef tamamla', 'LOCKED: finish {n} goals in {park}'],
  goalsCount: ['{n}/{m} hedef', '{n}/{m} goals'],
  bestIn: ['En iyi: {n}', 'Best: {n}'],
  board: ['KAYKAY', 'BOARD'],
  deck: ['Tahta', 'Deck'],
  wheels: ['Tekerler', 'Wheels'],
  needGoals: ['{n} hedef', '{n} goals'],
  needScore: ['{n} puan', '{n} pts'],
  back: ['GERİ', 'BACK'],
  deck_classic: ['Klasik', 'Classic'],
  deck_flame: ['Alev', 'Flame'],
  deck_checker: ['Dama', 'Checker'],
  deck_wave: ['Dalga', 'Wave'],
  deck_galaxy: ['Galaksi', 'Galaxy'],
  deck_gold: ['Altın', 'Gold'],
  wheel_white: ['Beyaz', 'White'],
  wheel_mint: ['Nane', 'Mint'],
  wheel_pink: ['Pembe', 'Pink'],
  wheel_sky: ['Gök Mavisi', 'Sky Blue'],
  wheel_violet: ['Mor', 'Violet'],
  wheel_gold: ['Altın', 'Gold'],
};

export const STRINGS: Partial<Strings> = {
  tr: Object.fromEntries(Object.entries(S).map(([k, v]) => [k, v[0]])),
  en: Object.fromEntries(Object.entries(S).map(([k, v]) => [k, v[1]])),
} as Partial<Strings>;
