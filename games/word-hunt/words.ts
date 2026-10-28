// Themed word lists. Each language has its own words (not translations), written in
// upper case with the correct alphabet: Turkish lists use Ç Ğ I İ Ö Ş Ü.
// Words are 3–10 letters so they always fit the 8x8 → 12x12 grids.

export interface Theme {
  name: { tr: string; en: string };
  tr: string[];
  en: string[];
}

export const THEMES: Theme[] = [
  {
    name: { tr: 'HAYVANLAR', en: 'ANIMALS' },
    tr: ['KEDİ', 'KÖPEK', 'AYI', 'TAVŞAN', 'KAPLAN', 'ASLAN', 'İNEK', 'KEÇİ', 'ÖRDEK', 'TİLKİ', 'KURT', 'KARTAL', 'ZÜRAFA', 'YILAN', 'KAPLUMBAĞA', 'SİNCAP', 'KİRPİ', 'BAYKUŞ'],
    en: ['CAT', 'DOG', 'BEAR', 'RABBIT', 'TIGER', 'LION', 'HORSE', 'SHEEP', 'GOAT', 'DUCK', 'FOX', 'WOLF', 'EAGLE', 'ZEBRA', 'SNAKE', 'MONKEY', 'GIRAFFE', 'TURTLE', 'SQUIRREL', 'OWL'],
  },
  {
    name: { tr: 'MEYVELER', en: 'FRUITS' },
    tr: ['ELMA', 'ARMUT', 'KİRAZ', 'ÇİLEK', 'MUZ', 'ÜZÜM', 'KAYISI', 'ŞEFTALİ', 'KARPUZ', 'KAVUN', 'İNCİR', 'NAR', 'PORTAKAL', 'ERİK', 'VİŞNE', 'AYVA', 'LİMON', 'MANDALİNA', 'DUT'],
    en: ['APPLE', 'PEAR', 'CHERRY', 'BANANA', 'GRAPE', 'PEACH', 'MELON', 'LEMON', 'ORANGE', 'PLUM', 'MANGO', 'KIWI', 'LIME', 'FIG', 'APRICOT', 'PAPAYA', 'COCONUT', 'BERRY'],
  },
  {
    name: { tr: 'RENKLER', en: 'COLOURS' },
    tr: ['KIRMIZI', 'MAVİ', 'YEŞİL', 'SARI', 'MOR', 'PEMBE', 'TURUNCU', 'SİYAH', 'BEYAZ', 'GRİ', 'KAHVERENGİ', 'LACİVERT', 'BORDO', 'TURKUAZ', 'EFLATUN', 'BEJ'],
    en: ['RED', 'BLUE', 'GREEN', 'YELLOW', 'PURPLE', 'PINK', 'ORANGE', 'BLACK', 'WHITE', 'GRAY', 'BROWN', 'CYAN', 'MAROON', 'VIOLET', 'SILVER', 'GOLD', 'NAVY', 'BEIGE'],
  },
  {
    name: { tr: 'UZAY', en: 'SPACE' },
    tr: ['GÜNEŞ', 'YILDIZ', 'GEZEGEN', 'ROKET', 'UYDU', 'DÜNYA', 'MARS', 'VENÜS', 'JÜPİTER', 'SATÜRN', 'GÖKTAŞI', 'ASTRONOT', 'GALAKSİ', 'YÖRÜNGE', 'TELESKOP', 'NEPTÜN'],
    en: ['SUN', 'MOON', 'STAR', 'PLANET', 'ROCKET', 'COMET', 'EARTH', 'MARS', 'VENUS', 'JUPITER', 'SATURN', 'GALAXY', 'ORBIT', 'ASTRONAUT', 'METEOR', 'NEBULA', 'NEPTUNE'],
  },
  {
    name: { tr: 'VÜCUT', en: 'BODY' },
    tr: ['GÖZ', 'KULAK', 'BURUN', 'AĞIZ', 'DİŞ', 'DİL', 'KOL', 'BACAK', 'PARMAK', 'OMUZ', 'DİZ', 'KALP', 'SAÇ', 'YÜZ', 'BOYUN', 'AYAK', 'DİRSEK', 'BİLEK', 'ÇENE'],
    en: ['EYE', 'EAR', 'NOSE', 'MOUTH', 'TOOTH', 'TONGUE', 'ARM', 'LEG', 'FINGER', 'SHOULDER', 'KNEE', 'HEART', 'HAIR', 'FACE', 'NECK', 'FOOT', 'HAND', 'ELBOW', 'WRIST'],
  },
  {
    name: { tr: 'SPOR', en: 'SPORTS' },
    tr: ['FUTBOL', 'BASKETBOL', 'VOLEYBOL', 'TENİS', 'YÜZME', 'GÜREŞ', 'BOKS', 'KAYAK', 'OKÇULUK', 'SATRANÇ', 'GOLF', 'KOŞU', 'HENTBOL', 'ESKRİM', 'BİSİKLET', 'JUDO', 'KÜREK'],
    en: ['SOCCER', 'BASKETBALL', 'TENNIS', 'SWIMMING', 'BOXING', 'GOLF', 'RUGBY', 'HOCKEY', 'CHESS', 'SKIING', 'ARCHERY', 'CYCLING', 'KARATE', 'RUNNING', 'CRICKET', 'JUDO', 'ROWING'],
  },
  {
    name: { tr: 'HAVA DURUMU', en: 'WEATHER' },
    tr: ['YAĞMUR', 'KAR', 'RÜZGAR', 'BULUT', 'GÜNEŞLİ', 'FIRTINA', 'SİS', 'DOLU', 'ŞİMŞEK', 'GÖKKUŞAĞI', 'YILDIRIM', 'BUZ', 'SICAK', 'SOĞUK', 'NEM', 'KIRAĞI', 'ÇİSENTİ'],
    en: ['RAIN', 'SNOW', 'WIND', 'CLOUD', 'SUNNY', 'STORM', 'FOG', 'HAIL', 'THUNDER', 'RAINBOW', 'LIGHTNING', 'ICE', 'HOT', 'COLD', 'FROST', 'BREEZE', 'DRIZZLE'],
  },
  {
    name: { tr: 'DENİZ', en: 'OCEAN' },
    tr: ['DALGA', 'KUM', 'MİDYE', 'YENGEÇ', 'AHTAPOT', 'YUNUS', 'BALİNA', 'MERCAN', 'DENİZATI', 'İSTAKOZ', 'ADA', 'GEMİ', 'LİMAN', 'ÇAPA', 'MARTI', 'KUMSAL', 'BALIK'],
    en: ['WAVE', 'SAND', 'SHELL', 'CRAB', 'OCTOPUS', 'DOLPHIN', 'WHALE', 'CORAL', 'SHARK', 'SEAHORSE', 'LOBSTER', 'ISLAND', 'SHIP', 'HARBOR', 'ANCHOR', 'SEAGULL', 'BEACH'],
  },
  {
    name: { tr: 'YEMEKLER', en: 'FOOD' },
    tr: ['EKMEK', 'PEYNİR', 'ZEYTİN', 'ÇORBA', 'PİLAV', 'KÖFTE', 'DÖNER', 'BÖREK', 'BAKLAVA', 'LAHMACUN', 'MANTI', 'SİMİT', 'AYRAN', 'KEBAP', 'YOĞURT', 'ÇAY', 'DOLMA', 'GÖZLEME'],
    en: ['BREAD', 'CHEESE', 'OLIVE', 'SOUP', 'RICE', 'PIZZA', 'PASTA', 'BURGER', 'SALAD', 'CAKE', 'COOKIE', 'SANDWICH', 'TACO', 'NOODLE', 'PANCAKE', 'WAFFLE', 'MUFFIN'],
  },
  {
    name: { tr: 'MÜZİK', en: 'MUSIC' },
    tr: ['GİTAR', 'PİYANO', 'DAVUL', 'KEMAN', 'FLÜT', 'SAZ', 'BAĞLAMA', 'NOTA', 'ŞARKI', 'RİTİM', 'MELODİ', 'KORO', 'TROMPET', 'ZURNA', 'KANUN', 'ORKESTRA', 'ŞEF', 'SOLİST'],
    en: ['GUITAR', 'PIANO', 'DRUM', 'VIOLIN', 'FLUTE', 'HARP', 'TRUMPET', 'NOTE', 'SONG', 'RHYTHM', 'MELODY', 'CHOIR', 'BASS', 'BAND', 'TEMPO', 'CELLO', 'LYRICS'],
  },
  {
    name: { tr: 'ÜLKELER', en: 'COUNTRIES' },
    tr: ['FRANSA', 'İSPANYA', 'İTALYA', 'JAPONYA', 'ÇİN', 'BREZİLYA', 'KANADA', 'MISIR', 'MEKSİKA', 'HİNDİSTAN', 'KENYA', 'PERU', 'ŞİLİ', 'YUNANİSTAN', 'TÜRKİYE', 'NORVEÇ', 'ALMANYA', 'İSVEÇ'],
    en: ['FRANCE', 'SPAIN', 'ITALY', 'JAPAN', 'CHINA', 'BRAZIL', 'CANADA', 'EGYPT', 'MEXICO', 'INDIA', 'KENYA', 'PERU', 'CHILE', 'GREECE', 'NORWAY', 'GERMANY', 'SWEDEN', 'POLAND'],
  },
  {
    name: { tr: 'MESLEKLER', en: 'JOBS' },
    tr: ['DOKTOR', 'ÖĞRETMEN', 'AŞÇI', 'PİLOT', 'POLİS', 'İTFAİYECİ', 'MÜHENDİS', 'AVUKAT', 'ÇİFTÇİ', 'BERBER', 'TERZİ', 'RESSAM', 'HEMŞİRE', 'GARSON', 'FIRINCI', 'MİMAR', 'DİŞÇİ'],
    en: ['DOCTOR', 'TEACHER', 'CHEF', 'PILOT', 'POLICE', 'FARMER', 'ENGINEER', 'LAWYER', 'BARBER', 'TAILOR', 'PAINTER', 'NURSE', 'WAITER', 'BAKER', 'ARCHITECT', 'DENTIST', 'PLUMBER'],
  },
];

/** Fill alphabets for the random letters around the hidden words. */
export const ALPHABET = {
  tr: 'ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ',
  en: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
};
