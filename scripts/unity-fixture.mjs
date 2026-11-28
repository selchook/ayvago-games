#!/usr/bin/env node
// The Unity fixture: a fake Unity WebGL build for testing the studio's Unity pipeline without Unity.
// It is assembled into a temporary folder for a test run and never into public/ or dist/, so it
// never reaches the registry, the catalog or a deployment:
//   index.html, TemplateData/   the package's real WebGL template (unity/com.ayvago.sdk/WebGLTemplates~/Ayvago),
//                               run through a stand-in for Unity's template preprocessor
//   Build/unity-fixture.loader.js     tools/unity-fixture/loader.js (createUnityInstance)
//   Build/unity-fixture.framework.js  tools/unity-fixture/framework.js with the package's real Ayvago.jslib
//   Build/unity-fixture.data, .wasm   filler downloads, so the loader reports progress
// The scripts serve it at /games/unity-fixture/ through the Vite plugin in vite.config.ts
// (AYVAGO_UNITY_FIXTURE=<folder>): smoke-test, platform-harness and gen-store-assets with
// --unity-fixture, and `npm run test:unity`.
// Usage: node scripts/unity-fixture.mjs [--out <dir>]   (prints the folder; then
//        AYVAGO_UNITY_FIXTURE=<dir> npm run dev and open /games/unity-fixture/)
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, copyFileSync, readdirSync, statSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const FIXTURE_SLUG = 'unity-fixture';
export const FIXTURE_DIR = join(root, 'tools', 'unity-fixture');
const TEMPLATE = join(root, 'unity', 'com.ayvago.sdk', 'WebGLTemplates~', 'Ayvago');
const JSLIB = join(root, 'unity', 'com.ayvago.sdk', 'Runtime', 'Plugins', 'WebGL', 'Ayvago.jslib');

/** The fixture's game.json (what games/<slug>/game.json is for a real Unity game). */
export const fixtureMeta = () => JSON.parse(readFileSync(join(FIXTURE_DIR, 'game.json'), 'utf8'));

/**
 * Unity's template preprocessing, as far as the Ayvago template uses it: `{{{ expression }}}` is
 * evaluated with the template variables in scope, and `#if X` / `#else` / `#endif` lines keep or drop
 * the lines between them.
 */
export function preprocess(text, vars) {
  const names = Object.keys(vars);
  const values = names.map((n) => vars[n]);
  const evaluate = (expr) => new Function(...names, `return (${expr});`)(...values);
  const out = [];
  const stack = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^#(if|else|endif)\b\s*(.*)$/);
    if (m) {
      if (m[1] === 'if') stack.push(!!evaluate(m[2].trim()));
      else if (m[1] === 'else') stack.push(!stack.pop());
      else stack.pop();
      continue;
    }
    if (stack.every(Boolean)) out.push(line.replace(/\{\{\{\s*([\s\S]+?)\s*\}\}\}/g, (_, e) => String(evaluate(e))));
  }
  return out.join('\n');
}

function copyDir(from, to, transform) {
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) {
    const src = join(from, name);
    if (statSync(src).isDirectory()) copyDir(src, join(to, name), transform);
    else if (/\.(html|css|js|json)$/.test(name)) writeFileSync(join(to, name), transform(readFileSync(src, 'utf8')));
    else copyFileSync(src, join(to, name));
  }
}

/** Assembles the fixture into `dir` (default: a new temporary folder) and returns the folder. */
export function stageUnityFixture(dir = mkdtempSync(join(tmpdir(), 'ayvago-unity-fixture-'))) {
  const name = FIXTURE_SLUG;
  const vars = {
    PRODUCT_NAME: fixtureMeta().title.en,
    COMPANY_NAME: 'Ayvago',
    PRODUCT_VERSION: '1.0.0',
    LOADER_FILENAME: `${name}.loader.js`,
    DATA_FILENAME: `${name}.data`,
    FRAMEWORK_FILENAME: `${name}.framework.js`,
    CODE_FILENAME: `${name}.wasm`,
    MEMORY_FILENAME: '',
    SYMBOLS_FILENAME: '',
    USE_WASM: true,
    USE_THREADS: false,
    AYVAGO_GAME_ID: name.replace(/-/g, ''),
  };
  rmSync(dir, { recursive: true, force: true });
  copyDir(TEMPLATE, dir, (text) => preprocess(text, vars));
  const build = join(dir, 'Build');
  mkdirSync(build, { recursive: true });
  copyFileSync(join(FIXTURE_DIR, 'loader.js'), join(build, vars.LOADER_FILENAME));
  const framework = readFileSync(join(FIXTURE_DIR, 'framework.js'), 'utf8');
  if (!framework.includes('/*__AYVAGO_JSLIB__*/')) throw new Error('framework.js lost its jslib marker');
  writeFileSync(join(build, vars.FRAMEWORK_FILENAME), framework.replace('/*__AYVAGO_JSLIB__*/', () => readFileSync(JSLIB, 'utf8')));
  writeFileSync(join(build, vars.DATA_FILENAME), randomBytes(384 * 1024));
  writeFileSync(join(build, vars.CODE_FILENAME), Buffer.concat([Buffer.from([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]), randomBytes(64 * 1024)]));
  return dir;
}

/** Stages the fixture for a test run and points the Vite plugin at it; returns a cleanup function. */
export function useUnityFixture() {
  const dir = stageUnityFixture();
  process.env.AYVAGO_UNITY_FIXTURE = dir;
  const cleanup = () => {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* already gone */ }
  };
  process.once('exit', cleanup);
  return cleanup;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--out');
  const dir = stageUnityFixture(i > 0 ? resolve(process.argv[i + 1]) : undefined);
  console.log(dir);
  if (!existsSync(join(dir, 'index.html'))) process.exit(1);
}
