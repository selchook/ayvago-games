// Street Heat: every word the game shows, in Turkish and English. Place names stand after a colon
// in the goals ("Teslim et: Otel"), so no Turkish suffix depends on the place.
import type { Strings } from '@core';

const tr: Record<string, string> = {
  // the pad
  gas: 'GAZ', brake: 'FREN', hbrake: 'EL FRENİ', horn: 'KORNA', cam: 'KAMERA',
  // HUD
  score: 'KAZANÇ', kmh: 'km/sa', heat: 'ARANMA', damage: 'HASAR', cargo: 'KARGO', calm: 'SAKİNLİK', suspicion: 'ŞÜPHE', escortHp: 'CİP',
  searching: 'ARANIYORSUN', stage: 'AŞAMA', clock: 'SÜRE', bustIn: 'YAKALANIYORSUN',
  // callouts
  busted: 'YAKALANDIN!', wrecked: 'HURDA OLDU!', lost: 'İZİ KAYBETTİRDİN!', heatN: 'ARANMA SEVİYESİ {n}', pursuit: 'TAKİP!', searchOn: 'POLİS ARIYOR',
  roadblock: 'BARİKAT!', spikes: 'ÇİVİ ŞERİDİ!', popped: 'LASTİKLER PATLADI!', delivered: 'TESLİM EDİLDİ!', pickedUp: 'ALINDI!', passengerIn: 'YOLCU BİNDİ!',
  checkpoint: 'KONTROL NOKTASI!', takedown: 'DURDURULDU!', redLight: 'KIRMIZI IŞIK!', nitroGo: 'NİTRO!', stunt: 'GÖSTERİ ATLAYIŞI!', airM: 'UÇUŞ {n} m',
  jobDone: 'İŞ TAMAM!', jobFailed: 'İŞ BAŞARISIZ', shiftOver: 'VARDİYA BİTTİ', timeLow: 'SÜRE AZALIYOR!', careful: 'DİKKAT, KIRILIR!', newJob: 'YENİ İŞ!',
  addTime: '+{n} SN', go: 'BAS GAZA!', smokeWarn: 'MOTOR DUMAN ATIYOR!', fireWarn: 'ARABA YANIYOR!', crash: 'ÇARPIŞMA!',
  // goals
  g_pickup: 'Al: {place}', g_deliver: 'Teslim et: {place}', g_arrive: 'Git: {place}', g_passenger: 'Yolcuyu al: {place}', g_checks: 'Kontrol noktası: {n} kaldı',
  g_lose: 'Polisi atlat!', g_tail: 'Arabayı izle, fazla yaklaşma', g_chase: 'Hedefe çarp, durdur', g_escort: 'Cipi koru: {place}',
  g_roam: 'İş bul: telefon, müşteri, atlayış', g_side: 'Teslim et: {place}', g_fare: 'Müşteriyi götür: {place}', g_rush: 'Sıradaki işi al', g_getaway: 'Yakalanmadan dayan!',
  g_mark: 'yeşil işaret', g_find: 'Hedef arabayı bul',
  // endings
  f_busted: 'YAKALANDIN', f_wrecked: 'ARABA HURDA', f_time: 'SÜRE BİTTİ', f_cargo: 'KARGO KIRILDI', f_lost: 'HEDEFİ KAÇIRDIN', f_spotted: 'FARK EDİLDİN',
  f_escaped: 'HEDEF KAÇTI', f_escort: 'CİP HURDA OLDU', f_shift: 'VARDİYA BİTTİ',
  w_noHeat: 'Silinecek iz yok', w_seen: 'Girerken gördüler!', w_noRepair: 'Araba sağlam',
  c_stunt: 'GÖSTERİ PRİMİ', c_spray: 'BOYANDI, İZ SİLİNDİ', c_repair: 'TAMİR EDİLDİ',
  // places
  pl_garage: 'Garaj', pl_precinct: 'Karakol', pl_spray: 'Boyacı', pl_plaza: 'Belediye Meydanı', pl_park: 'Park', pl_stunt: 'Gösteri Sahası', pl_docks: 'Rıhtım',
  pl_warehouse: 'Depo', pl_station: 'İstasyon', pl_bank: 'Banka', pl_diner: 'Lokanta', pl_hotel: 'Otel', pl_market: 'Pazar', pl_parking: 'Otopark', pl_tower: 'Kule', pl_gallery: 'Galeri',
  // dispatch
  dispatch: 'TELSİZ', m_story: 'HİKÂYE', m_roam: 'SERBEST SÜRÜŞ', m_getaway: 'KAÇIŞ', m_rush: 'TESLİMAT TELAŞI', garage: 'GARAJ', map: 'HARİTA', start: 'BAŞLA', back: 'GERİ',
  locked: 'KİLİTLİ', bankCash: 'KASA', bestN: 'REKOR {n}', jobN: '{n}. İŞ', reward: 'ÖDÜL', goals: 'GÖREVLER', starsH: 'YILDIZLAR', caseFile: 'DOSYA',
  roam_d: 'Sekiz dakikalık gece vardiyası. Telefon işaretlerinden teslimat al, taksiyle müşteri taşı, rampalardan atla. Boyacı aranmanı siler, garaj tamir eder.',
  getaway_d: 'Polis peşinde, sen dayan. Her 45 saniyede aranma seviyesi artar: barikatlar, çivi şeritleri, sıkıştıran ekipler. Dayandığın her saniye ve durdurduğun her ekip puan.',
  rush_d: 'Saatte 2:30 var. Telefon işaretinden işi al, işaretli adrese götür; her teslimat süre kazandırır. Ne kadar çok teslimat, o kadar çok para.',
  st1: '★ İşi bitir', st2time: '★★ {t} kala bitir', st2tail: '★★ Şüphe %50 altında', st2escort: '★★ Cip %50 üstünde', st2fast: '★★ {t} içinde bitir', st3: '★★★ Araba %70 üstünde',
  // garage
  buy: 'SATIN AL', select: 'SEÇ', inUse: 'KULLANILIYOR', afterJob: '{n}. işten sonra', notEnough: 'Para yetmiyor', maxed: 'TAM', paint: 'BOYA', upgrades: 'GELİŞTİRMELER',
  car_sedan: 'Sedan', car_hatch: 'Hatchback', car_taxi: 'Taksi', car_suv: 'Cip', car_sports: 'Spor', car_super: 'Süper',
  st_speed: 'HIZ', st_accel: 'İVME', st_grip: 'YOL TUTUŞ', st_armour: 'DAYANIKLILIK', st_nitro: 'NİTRO',
  up_engine: 'MOTOR', up_grip: 'LASTİK', up_armour: 'ZIRH', up_nitro: 'NİTRO',
  taxiNote: 'Taksiyle serbest sürüşte müşteri de taşırsın.',
  // results
  pay: 'ÜCRET', bonus: 'PRİM', takedowns: 'DURDURULAN EKİP', topSpeed: 'EN YÜKSEK HIZ', survived: 'DAYANILAN SÜRE', deliveries: 'TESLİMAT', fine: 'CEZA', banked: 'KASAYA',
  newCar: 'YENİ ARABA: {car}', nextJob: 'SONRAKİ', replay: 'TEKRAR GÖSTERİM', skip: 'GEÇ', theEnd: 'Dosya kapandı. Neon Koyu sana bir borçlu, Kıvılcım.',
  // map
  cityName: 'NEON KOYU', lg_you: 'SEN', lg_police: 'POLİS', lg_job: 'İŞ', lg_search: 'ARAMA', close: 'KAPAT',
  // tips
  tip_keys: '↑ gaz · ↓ fren/geri · ← → direksiyon · Boşluk el freni · Shift nitro · H korna · C kamera · M harita',
  tip_touch: 'Solda direksiyon, sağda GAZ ve FREN. EL FRENİ ile kaydır, NİTRO ile fırla.',
  tip_marker: 'Parlayan işaretin içinde dur.', tip_gps: 'Mini haritadaki rotayı izle.', tip_heat: 'Polis görürse ARANMA yükselir. Gözden kaybol ve arama bitene kadar saklan.',
};

const en: Record<string, string> = {
  gas: 'GAS', brake: 'BRAKE', hbrake: 'HANDBRAKE', horn: 'HORN', cam: 'CAMERA',
  score: 'CASH', kmh: 'km/h', heat: 'HEAT', damage: 'DAMAGE', cargo: 'CARGO', calm: 'CALM', suspicion: 'SUSPICION', escortHp: 'SUV',
  searching: 'SEARCHING', stage: 'STAGE', clock: 'TIME', bustIn: 'BEING BUSTED',
  busted: 'BUSTED!', wrecked: 'WRECKED!', lost: 'LOST THEM!', heatN: 'HEAT LEVEL {n}', pursuit: 'PURSUIT!', searchOn: 'POLICE SEARCHING',
  roadblock: 'ROADBLOCK!', spikes: 'SPIKE STRIP!', popped: 'TYRES POPPED!', delivered: 'DELIVERED!', pickedUp: 'PICKED UP!', passengerIn: 'PASSENGER IN!',
  checkpoint: 'CHECKPOINT!', takedown: 'TAKEDOWN!', redLight: 'RED LIGHT!', nitroGo: 'NITRO!', stunt: 'STUNT JUMP!', airM: 'AIR {n} m',
  jobDone: 'JOB DONE!', jobFailed: 'JOB FAILED', shiftOver: 'SHIFT OVER', timeLow: 'TIME IS RUNNING OUT!', careful: 'CAREFUL, FRAGILE!', newJob: 'NEW JOB!',
  addTime: '+{n} S', go: 'HIT IT!', smokeWarn: 'ENGINE SMOKING!', fireWarn: 'CAR ON FIRE!', crash: 'CRASH!',
  g_pickup: 'Pick up: {place}', g_deliver: 'Deliver: {place}', g_arrive: 'Drive to: {place}', g_passenger: 'Pick up the passenger: {place}', g_checks: 'Checkpoints left: {n}',
  g_lose: 'Lose the cops!', g_tail: 'Tail the car, don’t get too close', g_chase: 'Ram the target until it stops', g_escort: 'Protect the SUV: {place}',
  g_roam: 'Find work: phones, fares, jumps', g_side: 'Deliver: {place}', g_fare: 'Fare to: {place}', g_rush: 'Take the next job', g_getaway: 'Hold out, don’t get busted!',
  g_mark: 'the green marker', g_find: 'Find the target car',
  f_busted: 'BUSTED', f_wrecked: 'CAR WRECKED', f_time: 'OUT OF TIME', f_cargo: 'CARGO BROKEN', f_lost: 'LOST THE TARGET', f_spotted: 'YOU WERE SPOTTED',
  f_escaped: 'THE TARGET GOT AWAY', f_escort: 'THE SUV IS DOWN', f_shift: 'SHIFT OVER',
  w_noHeat: 'No heat to wash off', w_seen: 'They saw you go in!', w_noRepair: 'The car is fine',
  c_stunt: 'STUNT BONUS', c_spray: 'RESPRAYED, HEAT GONE', c_repair: 'REPAIRED',
  pl_garage: 'Garage', pl_precinct: 'Precinct', pl_spray: 'Spray Shop', pl_plaza: 'City Hall Plaza', pl_park: 'Park', pl_stunt: 'Stunt Yard', pl_docks: 'Docks',
  pl_warehouse: 'Warehouse', pl_station: 'Station', pl_bank: 'Bank', pl_diner: 'Diner', pl_hotel: 'Hotel', pl_market: 'Market', pl_parking: 'Parking Lot', pl_tower: 'Tower', pl_gallery: 'Gallery',
  dispatch: 'DISPATCH', m_story: 'STORY', m_roam: 'FREE ROAM', m_getaway: 'GETAWAY', m_rush: 'DELIVERY RUSH', garage: 'GARAGE', map: 'MAP', start: 'START', back: 'BACK',
  locked: 'LOCKED', bankCash: 'BANK', bestN: 'BEST {n}', jobN: 'JOB {n}', reward: 'REWARD', goals: 'OBJECTIVES', starsH: 'STARS', caseFile: 'CASE FILE',
  roam_d: 'An eight-minute night shift. Take deliveries from the phone markers, carry fares in a taxi, hit the stunt ramps. The spray shop washes off your heat, the garage fixes the car.',
  getaway_d: 'The police are on you: hold out. The heat rises every 45 seconds: roadblocks, spike strips, units boxing you in. Every second you last and every unit you take down scores.',
  rush_d: 'Two and a half minutes on the clock. Take a job at a phone marker and drive it to the address; every delivery buys more time. More deliveries, more cash.',
  st1: '★ Finish the job', st2time: '★★ Finish with {t} left', st2tail: '★★ Suspicion under 50%', st2escort: '★★ SUV above 50%', st2fast: '★★ Finish within {t}', st3: '★★★ Car above 70%',
  buy: 'BUY', select: 'SELECT', inUse: 'IN USE', afterJob: 'After job {n}', notEnough: 'Not enough cash', maxed: 'MAX', paint: 'PAINT', upgrades: 'UPGRADES',
  car_sedan: 'Sedan', car_hatch: 'Hatchback', car_taxi: 'Taxi', car_suv: 'SUV', car_sports: 'Sports', car_super: 'Super',
  st_speed: 'SPEED', st_accel: 'ACCEL', st_grip: 'GRIP', st_armour: 'TOUGHNESS', st_nitro: 'NITRO',
  up_engine: 'ENGINE', up_grip: 'TYRES', up_armour: 'ARMOUR', up_nitro: 'NITRO',
  taxiNote: 'In free roam a taxi picks up fares too.',
  pay: 'PAY', bonus: 'BONUS', takedowns: 'TAKEDOWNS', topSpeed: 'TOP SPEED', survived: 'TIME SURVIVED', deliveries: 'DELIVERIES', fine: 'FINE', banked: 'BANKED',
  newCar: 'NEW CAR: {car}', nextJob: 'NEXT', replay: 'REPLAY', skip: 'SKIP', theEnd: 'Case closed. Neon Bay owes you one, Spark.',
  cityName: 'NEON BAY', lg_you: 'YOU', lg_police: 'POLICE', lg_job: 'JOB', lg_search: 'SEARCH', close: 'CLOSE',
  tip_keys: '↑ gas · ↓ brake/reverse · ← → steer · Space handbrake · Shift nitro · H horn · C camera · M map',
  tip_touch: 'Steer on the left, GAS and BRAKE on the right. HANDBRAKE slides, NITRO boosts.',
  tip_marker: 'Stop inside the glowing marker.', tip_gps: 'Follow the route on the minimap.', tip_heat: 'If a cop sees you, your HEAT rises. Get out of sight and hide until the search ends.',
};

/** The story: titles and briefings. */
const STORY_TR: [string, string][] = [
  ['İlk Tur', 'Komiser Duru seni Kadife Çetesi\'ne şoför olarak soktu. Çetenin iş bulucusu Çivi, araba sürebildiğini görmek istiyor. Lokanta\'dan paketi al, zamanında Otel\'e götür.'],
  ['Dikkat, Kırılır', 'Galeri\'den antika cam dolu bir sandık Kule\'ye gidecek. Her sarsıntı bedel öder; kırarsan işin biter.'],
  ['Seçmeler', 'Bay İpek bizzat izliyor. Şehrin içinden sekiz kontrol noktası, tek bir saat. Ona gerçek bir şoför nasıl olur, göster.'],
  ['Sıcak Çanta', 'Banka\'nın arkasından bir çanta al. Alarm polisi getirecek: onları atlat, sonra çantayı garaja götür.'],
  ['Üç Durak', 'Pazar\'dan aldığın zarflar sırayla İstasyon\'a, Park\'a ve Rıhtım\'a gidecek. Çivi her ayağı tek tek saatlemiş.'],
  ['Gölge', 'Rakip bir kurye İstasyon\'dan çıkıyor. Görünmeden onu, malı bırakacağı yere kadar izle: geride dur ama gözünden kaçırma.'],
  ['Son Tren', 'Çetenin muhasebecisi Otel\'de bekliyor, treni birazdan kalkıyor. Çabuk korkar: çarpma, kırmızıda geçme, kaldırıma çıkma.'],
  ['Çarp Durdur', 'Rakibin kamyoneti çetenin mallarıyla Otopark\'tan çıkıyor. Kaçmadan önce yetiş ve durana kadar çarp.'],
  ['Konvoy', 'Çetenin cipi Rıhtım\'dan garaja gidecek, polis de peşinde. Önlerini kes, çarp, cipi sağ salim götür.'],
  ['Çekilmiş Araç', 'Bay İpek\'in gözdesi spor araba Karakol\'un otoparkında. Duru kapıyı açık bıraktı; inandırıcı olsun: arabayı al, polisi atlat, garaja bırak.'],
  ['Gece Turu', 'Park, gösteri sahası ve rıhtım boyunca on kontrol noktası. Rampadan atlamak çoğu zaman virajdan hızlıdır.'],
  ['İhanet', 'Tuzaktı: polis Rıhtım\'da bekliyordu ve herkes senin kim olduğunu bilmiyor. Üç yıldızlık aranmayı atlat, Boyacı\'da saklan.'],
  ['Büyük Vurgun', 'Bu gece Bay İpek her şeyi taşıyor. Ekibi Banka\'dan al, polisi atlat, İpek\'in arabasını yakalayıp durdur, sonra delilleri Karakol\'a getir. Komiser Duru bekliyor.'],
];
const STORY_EN: [string, string][] = [
  ['First Run', 'Inspector Duru put you behind the wheel for the Velvet crew. Their fixer, Nails, wants proof you can drive. Pick up the parcel at the Diner and get it to the Hotel on time.'],
  ['Handle With Care', 'A crate of antique glass goes from the Gallery to the Tower. Every bump costs; break it and the job is over.'],
  ['The Audition', 'Mr. Silk himself is watching. Eight checkpoints across town, one clock. Show him what a real wheelman looks like.'],
  ['Hot Bag', 'Collect a bag behind the Bank. The alarm will bring the police: shake them off, then take the bag to the garage.'],
  ['Three Stops', 'Envelopes from the Market go to the Station, the Park and the Docks, in that order. Nails timed every leg.'],
  ['Shadow', 'A rival courier leaves the Station. Follow him to his drop without being seen: stay back, but keep him in sight.'],
  ['Last Train', 'The crew’s accountant waits at the Hotel and his train leaves soon. He scares easily: no crashes, no red lights, no driving on the pavement.'],
  ['Ram Job', 'The rival’s van is leaving the Parking Lot with the crew’s goods. Catch it and ram it until it gives up, before it gets away.'],
  ['Convoy', 'The crew’s SUV must get from the Docks to the garage with the police on its tail. Block them, ram them, keep the SUV in one piece.'],
  ['Impound', 'Mr. Silk’s favourite sports car sits in the Precinct’s lot. Duru left the gate open; make it look real: take the car, lose the heat, park it at the garage.'],
  ['Night Moves', 'Ten checkpoints through the park, the stunt yard and the docks. A ramp is often faster than a corner.'],
  ['Double Cross', 'It was a set-up: the police were waiting at the Docks, and not everyone knows whose side you are on. Lose three stars of heat and hide at the Spray Shop.'],
  ['The Big Score', 'Tonight Mr. Silk moves everything. Pick up the crew at the Bank, lose the police, catch Silk’s car and stop it, then bring the evidence to the Precinct. Inspector Duru is waiting.'],
];
STORY_TR.forEach(([a, b], i) => { tr[`m${i + 1}t`] = a; tr[`m${i + 1}b`] = b; });
STORY_EN.forEach(([a, b], i) => { en[`m${i + 1}t`] = a; en[`m${i + 1}b`] = b; });

export const STRINGS: Partial<Strings> = { tr, en } as unknown as Partial<Strings>;
export const MISSION_COUNT = STORY_EN.length;
