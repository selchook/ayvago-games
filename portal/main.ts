import '@fontsource/press-start-2p/400.css';
import '@fontsource/pixelify-sans/400.css';
import './style.css';
import registry from '../src/generated/registry.json';
import { getLang, setLang, loc, type Lang, type Localized } from '../src/core/i18n';

interface Entry {
  id: string; title: Localized; description: Localized; genres: string[]; orientation: string; thumb: string | null;
}

const games = (registry.games as Entry[]).slice();
const UI: Record<Lang, Record<string, string>> = {
  tr: { hero: '{n} RETRO OYUN', sub: 'Arcade, aksiyon, bulmaca ve daha fazlası. Tarayıcıda anında oyna.', all: 'TÜMÜ', search: 'Oyun ara…', games: 'oyun',
    arcade: 'ARCADE', action: 'AKSİYON', casual: 'GÜNDELİK', puzzle: 'BULMACA', retro: 'RETRO', sports: 'SPOR', strategy: 'STRATEJİ', card: 'KART', word: 'KELİME' },
  en: { hero: '{n} RETRO GAMES', sub: 'Arcade, action, puzzle and more. Play instantly in your browser.', all: 'ALL', search: 'Search games…', games: 'games',
    arcade: 'ARCADE', action: 'ACTION', casual: 'CASUAL', puzzle: 'PUZZLE', retro: 'RETRO', sports: 'SPORTS', strategy: 'STRATEGY', card: 'CARD', word: 'WORD' },
};
let filter = 'all';
const $ = (id: string) => document.getElementById(id)!;

function render(): void {
  const L = UI[getLang()];
  document.documentElement.lang = getLang();
  $('lang').textContent = getLang() === 'tr' ? 'EN' : 'TR';
  $('hero-title').textContent = L.hero.replace('{n}', String(games.length));
  $('hero-sub').textContent = L.sub;
  (document.getElementById('search') as HTMLInputElement).placeholder = L.search;
  $('count').textContent = `${games.length} ${L.games}`;

  const genres = ['all', ...new Set(games.flatMap((g) => g.genres))];
  const f = $('filters');
  f.replaceChildren(...genres.map((g) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.type = 'button';
    b.textContent = L[g] ?? g.toUpperCase();
    b.setAttribute('aria-pressed', String(g === filter));
    b.onclick = () => { filter = g; render(); };
    return b;
  }));

  const q = (document.getElementById('search') as HTMLInputElement).value.trim().toLocaleLowerCase(getLang());
  const list = games.filter((g) => (filter === 'all' || g.genres.includes(filter))
    && (!q || `${g.title.tr} ${g.title.en} ${g.id}`.toLocaleLowerCase(getLang()).includes(q)));
  $('grid').replaceChildren(...list.map((g) => {
    const a = document.createElement('a');
    a.className = 'card';
    a.href = `./games/${g.id}/?lang=${getLang()}`;
    const th = document.createElement('div');
    th.className = 'thumb' + (g.orientation === 'landscape' ? ' land' : '');
    if (g.thumb) th.style.backgroundImage = `url(./${g.thumb})`;
    else th.textContent = loc(g.title).slice(0, 1);
    const m = document.createElement('div');
    m.className = 'meta';
    const h = document.createElement('h2');
    h.textContent = loc(g.title);
    const tags = document.createElement('div');
    tags.className = 'tags';
    tags.append(...g.genres.slice(0, 3).map((x) => Object.assign(document.createElement('span'), { className: 'tag', textContent: L[x] ?? x })));
    m.append(h, tags);
    a.append(th, m);
    a.title = loc(g.description);
    return a;
  }));
}

$('lang').addEventListener('click', () => { setLang(getLang() === 'tr' ? 'en' : 'tr'); render(); });
document.getElementById('search')!.addEventListener('input', render);
render();
