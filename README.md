# Ayvago Games

Retro arcade, aksiyon, casual ve bulmaca oyunlarını Ayvago platformu için üreten oyun fabrikası.

- **Motor:** Phaser 3.90 + TypeScript + Vite
- **Platform:** Mobil (dokunmatik) + masaüstü (klavye/fare)
- **Dil:** TR + EN
- **Grafik ve ses:** Kenney CC0 paketleri
- **Açılış:** Her oyun Ayvago açılış intro'su ile başlar. Bu, Unity'deki `AyvagoBootIntro.cs`'in birebir portudur.

## Hızlı başlangıç

```bash
npm install
npm run dev            # http://localhost:5173  → portal; /games/<slug>/ → oyun
npm run build          # dist/ → statik olarak her yere yüklenebilir
npm run test:smoke     # tüm oyunlar için otomatik test (Playwright)
npm run test:platform  # ayvago.com gibi iframe içinde GHA protokol testi
npm run release        # build + testler + ayvago.json + kapak/ikon
```

## Yeni oyun ekleme (A'dan Z'ye)

1. Fikri `docs/GAMES.md`'ye ekle.
2. Oyunu oluştur: `npm run new-game -- benim-oyunum "My Game"`.
3. Oyunu yaz: `games/benim-oyunum/`. Kurallar `.claude/skills/ayvago-new-game/SKILL.md`'de.
4. Tek oyunu test et: `node scripts/smoke-test.mjs --dev --serial benim-oyunum`.
5. Yayın öncesi `npm run release` çalıştır. Ardından `platform/arcade-catalog.ts` dosyasını platform reposuna kopyala ve Vercel'e deploy et.

Claude Code ile: `ayvago-game-dev` agent'ına slug + konsept ver, ardından `ayvago-game-qa` ile kontrol ettir.

## Mimari

| Katman | Yer | Görev |
|---|---|---|
| Intro | `src/core/intro.ts` | Ayvago açılışı (5,3 sn, dokunuşla atlanır). Oyun bu sırada arka planda yüklenir. |
| Akış | `src/core/scenes.ts` | Boot → Menü → Oyun → Duraklat / Oyun Sonu |
| Oyun tabanı | `src/core/ArcadeScene.ts` | skor, HUD, duraklatma, CRT efekti, `endGame()` |
| Kontroller | `src/core/controls.ts` | klavye + sanal joystick/butonlar |
| Platform SDK | `src/core/sdk.ts` + `src/core/ayvago/adapter.ts` | ayvago.com GHA_* protokolü (resmi adapter): skor oturumu, liderlik tablosu, pause/mute/dil |
| i18n | `src/core/i18n.ts` | TR/EN, `?lang=` parametresi, tarayıcı dili |
| Portal | `index.html`, `portal/` | oyun kataloğu (tür filtresi, arama, TR/EN) |

## Lisanslar

- **Grafik ve ses:** Kenney.nl (CC0)
- **Fontlar:** Press Start 2P ve Pixelify Sans (SIL OFL)
- **Ayvago marka görselleri:** Ayvago'ya aittir.
