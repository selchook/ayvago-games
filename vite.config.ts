import { defineConfig, type Plugin } from 'vite';
import { readdirSync, existsSync, statSync, createReadStream } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

// Every games/<slug>/index.html becomes its own page; the portal is the root index.html.
// GAMES="slug slug" builds only those games (CI tests only the games a change touches).
// Unity games ("engine": "unity" in game.json) have no games/<slug>/index.html, so they are not
// inputs here: their WebGL build lives in public/games/<slug>/, which Vite copies into dist/ as is.
const gamesDir = resolve(__dirname, 'games');
const only = process.env.GAMES?.split(/[\s,]+/).filter(Boolean);
const input: Record<string, string> = { portal: resolve(__dirname, 'index.html') };
for (const slug of only?.length ? only : readdirSync(gamesDir)) {
  const html = resolve(gamesDir, slug, 'index.html');
  if (existsSync(html)) input[slug] = html;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.wasm': 'application/wasm', '.data': 'application/octet-stream',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.svg': 'image/svg+xml',
};

function sendFile(res: ServerResponse, file: string): void {
  res.statusCode = 200;
  res.setHeader('Content-Type', MIME[extname(file).toLowerCase()] ?? 'application/octet-stream');
  res.setHeader('Content-Length', String(statSync(file).size));
  res.setHeader('Cache-Control', 'no-cache');
  createReadStream(file).pipe(res);
}

/**
 * Unity WebGL games. In dev, Vite answers /games/<slug>/ with the portal (its HTML fallback) when
 * games/<slug>/index.html does not exist: this serves public/games/<slug>/index.html of a Unity
 * build as it is (the build's other files are plain public files). Production needs nothing: the
 * build is copied into dist/ and served as static files. With AYVAGO_UNITY_FIXTURE=<folder> (the
 * Unity test fixture, scripts/unity-fixture.mjs) it also serves that folder at
 * /games/unity-fixture/, in dev and in preview, without it ever entering public/ or dist/.
 */
function unityGames(): Plugin {
  const fixture = process.env.AYVAGO_UNITY_FIXTURE;
  const serve = (req: IncomingMessage, res: ServerResponse, next: () => void, dev: boolean) => {
    let path: string;
    try {
      path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    } catch {
      return next();
    }
    if (fixture && (path === '/games/unity-fixture' || path.startsWith('/games/unity-fixture/'))) {
      if (path === '/games/unity-fixture') {
        res.statusCode = 301;
        res.setHeader('Location', '/games/unity-fixture/');
        return res.end();
      }
      const rel = path.slice('/games/unity-fixture/'.length) || 'index.html';
      const file = resolve(fixture, rel);
      if (!file.startsWith(resolve(fixture) + sep) || !existsSync(file) || statSync(file).isDirectory()) return next();
      return sendFile(res, file);
    }
    const m = dev ? path.match(/^\/games\/([a-z0-9-]+)(\/(index\.html)?)?$/) : null;
    if (m && !existsSync(resolve(gamesDir, m[1], 'index.html'))) {
      const html = resolve(__dirname, 'public', 'games', m[1], 'index.html');
      if (existsSync(html)) {
        if (!m[2]) {
          res.statusCode = 301;
          res.setHeader('Location', `/games/${m[1]}/`);
          return res.end();
        }
        return sendFile(res, html);
      }
    }
    next();
  };
  return {
    name: 'ayvago-unity-games',
    configureServer(server) {
      server.middlewares.use((req, res, next) => serve(req, res, next, true));
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => serve(req, res, next, false));
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [unityGames()],
  // parallel dev servers (smoke tests from several agents) each get their own dep cache
  cacheDir: process.env.VITE_CACHE_DIR ?? 'node_modules/.vite',
  optimizeDeps: { include: ['phaser'] },
  resolve: { alias: { '@core': resolve(__dirname, 'src/core') } },
  build: {
    target: 'es2020',
    assetsDir: '_app',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input,
      output: { manualChunks: { phaser: ['phaser'] } },
    },
  },
  server: { host: true },
});
