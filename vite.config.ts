import { defineConfig } from 'vite';
import { readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Every games/<slug>/index.html becomes its own page; the portal is the root index.html.
// GAMES="slug slug" builds only those games (CI tests only the games a change touches).
const gamesDir = resolve(__dirname, 'games');
const only = process.env.GAMES?.split(/[\s,]+/).filter(Boolean);
const input: Record<string, string> = { portal: resolve(__dirname, 'index.html') };
for (const slug of only?.length ? only : readdirSync(gamesDir)) {
  const html = resolve(gamesDir, slug, 'index.html');
  if (existsSync(html)) input[slug] = html;
}

export default defineConfig({
  base: './',
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
