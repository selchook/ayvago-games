#!/usr/bin/env node
// Checks the Unity package (unity/com.ayvago.sdk) without Unity: `npm run check:unity`.
//   1. every file and folder has a committed .meta with a unique GUID (a git-installed package is
//      immutable: Unity ignores assets without one); --fix-meta writes the missing ones
//   2. Documentation~/AYVAGO_UNITY_SDK.md is identical to docs/unity/AYVAGO_UNITY_SDK.md
//   3. the template's ayvago-adapter.js is the current bundle of src/core/ayvago/adapter.ts
//   4. the jslib and the template's bridge parse as JavaScript; the template has its hooks
//   5. mcs (Mono's C# compiler, C# 7.2 at most) compiles Runtime/ against tools/unity-check/stubs
//      for the WebGL player (DllImport path, both input backends) and for the Editor, and Editor/
//      against the Editor stubs. Without mcs this step is skipped with a warning (--require-mcs fails).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { checkMetas } from './unity-meta.mjs';
import { bundleAdapter, ADAPTER_JS } from './build-unity-adapter.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = join(root, 'unity', 'com.ayvago.sdk');
const args = process.argv.slice(2);
const failures = [];
const ok = (msg) => console.log(`ok    ${msg}`);
const fail = (msg) => { failures.push(msg); console.log(`FAIL  ${msg}`); };

// 1. .meta files
const metas = checkMetas(pkg, { fix: args.includes('--fix-meta') });
for (const w of metas.written) console.log(`wrote ${w}`);
if (metas.problems.length) metas.problems.forEach((p) => fail(`meta: ${p}`));
else ok(`.meta files: ${metas.count} assets, unique GUIDs`);

// 2. the SDK contract shipped in the package
const doc = readFileSync(join(root, 'docs', 'unity', 'AYVAGO_UNITY_SDK.md'), 'utf8');
const docCopy = join(pkg, 'Documentation~', 'AYVAGO_UNITY_SDK.md');
if (!existsSync(docCopy) || readFileSync(docCopy, 'utf8') !== doc) fail('Documentation~/AYVAGO_UNITY_SDK.md differs from docs/unity/AYVAGO_UNITY_SDK.md: cp docs/unity/AYVAGO_UNITY_SDK.md "unity/com.ayvago.sdk/Documentation~/"');
else ok('Documentation~/AYVAGO_UNITY_SDK.md matches docs/unity/AYVAGO_UNITY_SDK.md');

// 3. the adapter bundle
const bundle = await bundleAdapter();
if (!existsSync(ADAPTER_JS) || readFileSync(ADAPTER_JS, 'utf8') !== bundle) fail('TemplateData/ayvago-adapter.js is stale: node scripts/build-unity-adapter.mjs');
else ok('TemplateData/ayvago-adapter.js is the current adapter bundle');

// 4. the JavaScript pieces
const template = join(pkg, 'WebGLTemplates~', 'Ayvago');
for (const [label, file] of [['Ayvago.jslib', join(pkg, 'Runtime', 'Plugins', 'WebGL', 'Ayvago.jslib')], ['ayvago-bridge.js', join(template, 'TemplateData', 'ayvago-bridge.js')]]) {
  try {
    new vm.Script(readFileSync(file, 'utf8'), { filename: label });
    ok(`${label} parses`);
  } catch (e) {
    fail(`${label}: ${e.message}`);
  }
}
for (const f of ['TemplateData/ayvago-bridge.js', 'TemplateData/ayvago-adapter.js', 'TemplateData/style.css']) {
  const text = readFileSync(join(template, f), 'utf8');
  // Unity preprocesses the template's text files: no triple braces outside index.html
  if (text.includes('{{{')) fail(`${f} contains "{{{" (Unity would preprocess it)`);
}
const html = readFileSync(join(template, 'index.html'), 'utf8');
const need = ['{{{ LOADER_FILENAME }}}', '{{{ DATA_FILENAME }}}', '{{{ FRAMEWORK_FILENAME }}}', '{{{ CODE_FILENAME }}}', '{{{ AYVAGO_GAME_ID }}}', 'TemplateData/ayvago-adapter.js', 'TemplateData/ayvago-bridge.js', 'unity-canvas'];
const missing = need.filter((n) => !html.includes(n));
if (missing.length) fail(`index.html lacks ${missing.join(', ')}`);
else ok('index.html has the loader variables, the game id and both scripts');

// 5. C# with mcs
const mcs = ['/usr/bin/mcs', 'mcs'].find((m) => spawnSync(m, ['--version'], { encoding: 'utf8' }).status === 0);
if (!mcs) {
  const msg = 'mcs (mono-mcs) not found: the C# was not compiled';
  if (args.includes('--require-mcs')) fail(msg);
  else console.log(`WARN  ${msg}`);
} else {
  const cs = (dir) => {
    const out = [];
    const walk = (d) => readdirSync(d).forEach((n) => {
      const f = join(d, n);
      if (statSync(f).isDirectory()) walk(f);
      else if (n.endsWith('.cs')) out.push(f);
    });
    walk(dir);
    return out.sort();
  };
  const stubs = join(root, 'tools', 'unity-check', 'stubs');
  const tmp = mkdtempSync(join(tmpdir(), 'ayvago-mcs-'));
  const compile = (label, out, sources, refs, defines) => {
    const argv = ['-target:library', '-langversion:7.2', '-nostdlib-', '-warnaserror+', '-nowarn:1591',
      `-out:${join(tmp, out)}`, ...refs.map((r) => `-r:${join(tmp, r)}`), ...(defines.length ? [`-define:${defines.join(';')}`] : []), ...sources];
    const r = spawnSync(mcs, argv, { encoding: 'utf8' });
    const text = `${r.stdout}${r.stderr}`.trim();
    if (r.status !== 0) fail(`mcs ${label}:\n${text}`);
    else ok(`mcs ${label}${/warning/.test(text) ? `\n${text}` : ''}`);
    return r.status === 0;
  };
  try {
    const engine = ['UnityEngine.cs', 'UnityEngine.UI.cs', 'UnityEngine.InputSystem.cs'].map((f) => join(stubs, f));
    if (compile('stubs: UnityEngine, UI, InputSystem', 'UnityEngine.dll', engine, [], [])
      && compile('stubs: UnityEditor', 'UnityEditor.dll', [join(stubs, 'UnityEditor.cs')], ['UnityEngine.dll'], [])) {
      const runtime = cs(join(pkg, 'Runtime'));
      compile(`Runtime, WebGL player (${runtime.length} files; Input System + legacy input)`, 'Ayvago.Runtime.WebGL.dll', runtime, ['UnityEngine.dll'],
        ['UNITY_WEBGL', 'ENABLE_INPUT_SYSTEM', 'AYVAGO_INPUT_SYSTEM', 'ENABLE_LEGACY_INPUT_MANAGER']);
      compile('Runtime, WebGL player (Input System package only)', 'Ayvago.Runtime.NewInput.dll', runtime, ['UnityEngine.dll'],
        ['UNITY_WEBGL', 'ENABLE_INPUT_SYSTEM', 'AYVAGO_INPUT_SYSTEM']);
      if (compile('Runtime, Editor (legacy input)', 'Ayvago.Runtime.dll', runtime, ['UnityEngine.dll'], ['UNITY_EDITOR', 'UNITY_WEBGL', 'ENABLE_LEGACY_INPUT_MANAGER'])) {
        const editor = cs(join(pkg, 'Editor'));
        compile(`Editor (${editor.length} files)`, 'Ayvago.Editor.dll', editor, ['UnityEngine.dll', 'UnityEditor.dll', 'Ayvago.Runtime.dll'], ['UNITY_EDITOR', 'UNITY_WEBGL']);
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (failures.length) {
  console.log(`\ncheck:unity: ${failures.length} problem(s)`);
  process.exit(1);
}
console.log('\ncheck:unity: all good');
