// Unity .meta files for the com.ayvago.sdk package. A git-installed UPM package is immutable:
// Unity ignores (with a warning) every asset without a committed .meta, so every file and folder
// in the package has one, with a stable GUID (an MD5 of the package path, so regenerating gives
// the same GUIDs). Folders whose name ends in "~" (WebGLTemplates~, Documentation~) and dot files
// are ignored by Unity and get none.
import { createHash } from 'node:crypto';
import { readdirSync, statSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, extname, basename } from 'node:path';

export const PACKAGE = 'com.ayvago.sdk';

export const guidOf = (rel) => createHash('md5').update(`${PACKAGE}/${rel.split('\\').join('/')}`).digest('hex');

const tail = 'userData: \n  assetBundleName: \n  assetBundleVariant: \n';

const meta = {
  folder: (g) => `fileFormatVersion: 2\nguid: ${g}\nfolderAsset: yes\nDefaultImporter:\n  externalObjects: {}\n  ${tail}`,
  cs: (g) => `fileFormatVersion: 2\nguid: ${g}\nMonoImporter:\n  externalObjects: {}\n  serializedVersion: 2\n  defaultReferences: []\n  executionOrder: 0\n  icon: {instanceID: 0}\n  ${tail}`,
  asmdef: (g) => `fileFormatVersion: 2\nguid: ${g}\nAssemblyDefinitionImporter:\n  externalObjects: {}\n  ${tail}`,
  text: (g) => `fileFormatVersion: 2\nguid: ${g}\nTextScriptImporter:\n  externalObjects: {}\n  ${tail}`,
  manifest: (g) => `fileFormatVersion: 2\nguid: ${g}\nPackageManifestImporter:\n  externalObjects: {}\n  ${tail}`,
  // enabled for WebGL only
  jslib: (g) => `fileFormatVersion: 2
guid: ${g}
PluginImporter:
  externalObjects: {}
  serializedVersion: 2
  iconMap: {}
  executionOrder: {}
  defineConstraints: []
  isPreloaded: 0
  isOverridable: 0
  isExplicitlyReferenced: 0
  validateReferences: 1
  platformData:
  - first:
      Any:
    second:
      enabled: 0
      settings: {}
  - first:
      Editor: Editor
    second:
      enabled: 0
      settings:
        DefaultValueInitialized: true
  - first:
      WebGL: WebGL
    second:
      enabled: 1
      settings: {}
  ${tail}`,
  // Sprite (2D and UI), single, alpha is transparency, no mipmaps, bilinear, high-quality compression
  png: (g, maxSize) => `fileFormatVersion: 2
guid: ${g}
TextureImporter:
  internalIDToNameTable: []
  externalObjects: {}
  serializedVersion: 12
  mipmaps:
    mipMapMode: 0
    enableMipMap: 0
    sRGBTexture: 1
    linearTexture: 0
    fadeOut: 0
    borderMipMap: 0
    mipMapsPreserveCoverage: 0
    alphaTestReferenceValue: 0.5
    mipMapFadeDistanceStart: 1
    mipMapFadeDistanceEnd: 3
  bumpmap:
    convertToNormalMap: 0
    externalNormalMap: 0
    heightScale: 0.25
    normalMapFilter: 0
    flipGreenChannel: 0
  isReadable: 0
  streamingMipmaps: 0
  streamingMipmapsPriority: 0
  vTOnly: 0
  ignoreMipmapLimit: 0
  grayScaleToAlpha: 0
  generateCubemap: 6
  cubemapConvolution: 0
  seamlessCubemap: 0
  textureFormat: 1
  maxTextureSize: ${maxSize}
  textureSettings:
    serializedVersion: 2
    filterMode: 1
    aniso: 1
    mipBias: 0
    wrapU: 1
    wrapV: 1
    wrapW: 1
  nPOTScale: 0
  lightmap: 0
  compressionQuality: 50
  spriteMode: 1
  spriteExtrude: 1
  spriteMeshType: 1
  alignment: 0
  spritePivot: {x: 0.5, y: 0.5}
  spritePixelsToUnits: 100
  spriteBorder: {x: 0, y: 0, z: 0, w: 0}
  spriteGenerateFallbackPhysicsShape: 0
  alphaUsage: 1
  alphaIsTransparency: 1
  spriteTessellationDetail: -1
  textureType: 8
  textureShape: 1
  singleChannelComponent: 0
  flipbookRows: 1
  flipbookColumns: 1
  maxTextureSizeSet: 0
  compressionQualitySet: 0
  textureFormatSet: 0
  ignorePngGamma: 0
  applyGammaDecoding: 0
  swizzle: 50462976
  cookieLightType: 0
  platformSettings:
  - serializedVersion: 3
    buildTarget: DefaultTexturePlatform
    maxTextureSize: ${maxSize}
    resizeAlgorithm: 0
    textureFormat: -1
    textureCompression: 2
    compressionQuality: 50
    crunchedCompression: 0
    allowsAlphaSplitting: 0
    overridden: 0
    ignorePlatformSupport: 0
    androidETC2FallbackOverride: 0
    forceMaximumCompressionQuality_BC6H_BC7: 0
  spriteSheet:
    serializedVersion: 2
    sprites: []
    outline: []
    physicsShape: []
    bones: []
    spriteID: 5e97eb03825dee720800000000000000
    internalID: 0
    vertices: []
    indices:
    edges: []
    weights: []
    secondaryTextures: []
    nameFileIdTable: {}
  mipmapLimitGroupName:
  pSDRemoveMatte: 0
  ${tail}`,
  // a dynamic font with its family name; `fallback` lists fonts (package paths) Unity takes missing glyphs from
  ttf: (g, family, fallback) => `fileFormatVersion: 2
guid: ${g}
TrueTypeFontImporter:
  externalObjects: {}
  serializedVersion: 4
  fontSize: 16
  forceTextureCase: -2
  characterSpacing: 0
  characterPadding: 1
  includeFontData: 1
  fontNames:
  - ${family}
  fallbackFontReferences:${fallback.length ? '\n' + fallback.map((p) => `  - {fileID: 12800000, guid: ${guidOf(p)}, type: 3}`).join('\n') : ' []'}
  customCharacters:
  fontRenderingMode: 0
  ascentCalculationMode: 1
  useLegacyBoundsCalculation: 0
  shouldRoundAdvanceValue: 1
  ${tail}`,
};

/** Family names and glyph fallbacks of the package fonts (Fredoka has no ğ Ğ İ ş Ş; Ayvago Pixel TR only İ Ö Ü). */
const FONTS = {
  'Fredoka-SemiBold.ttf': ['Fredoka SemiBold', ['Fonts/Nunito-Bold.ttf']],
  'Fredoka-Bold.ttf': ['Fredoka', ['Fonts/Nunito-Bold.ttf']],
  'Nunito-Bold.ttf': ['Nunito', []],
  'Nunito-ExtraBold.ttf': ['Nunito ExtraBold', []],
  'PixelifySans-Regular.ttf': ['Pixelify Sans', []],
  'PixelifySans-Bold.ttf': ['Pixelify Sans', []],
  'PressStart2P-Regular.ttf': ['Press Start 2P', []],
  'AyvagoPixelTR.ttf': ['Ayvago Pixel TR', ['Fonts/PressStart2P-Regular.ttf']],
};

/** Textures wider than 2048 px keep their size (boot_ayvag.png is 2050 px wide). */
function pngMax(file) {
  const b = readFileSync(file);
  const [w, h] = [b.readUInt32BE(16), b.readUInt32BE(20)];
  return Math.max(w, h) > 2048 ? 4096 : 2048;
}

export function metaFor(pkgDir, rel) {
  const full = join(pkgDir, rel);
  const g = guidOf(rel);
  if (statSync(full).isDirectory()) return meta.folder(g);
  const ext = extname(rel).toLowerCase();
  const name = basename(rel);
  if (name === 'package.json' && rel === 'package.json') return meta.manifest(g);
  if (ext === '.cs') return meta.cs(g);
  if (ext === '.asmdef') return meta.asmdef(g);
  if (ext === '.jslib') return meta.jslib(g);
  if (ext === '.png') return meta.png(g, pngMax(full));
  if (ext === '.ttf') {
    const f = FONTS[name];
    if (!f) throw new Error(`no font entry for ${rel} in scripts/unity-meta.mjs`);
    return meta.ttf(g, f[0], f[1]);
  }
  if (['.md', '.txt', '.json'].includes(ext)) return meta.text(g);
  throw new Error(`no .meta template for ${rel}`);
}

/** Every path in the package that needs a .meta (relative, forward slashes). */
export function assetPaths(pkgDir) {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      if (name.startsWith('.') || name.endsWith('.meta')) continue;
      const full = join(dir, name);
      const rel = relative(pkgDir, full).split('\\').join('/');
      if (name.endsWith('~')) continue;   // ignored by Unity, needs no .meta
      out.push(rel);
      if (statSync(full).isDirectory()) walk(full);
    }
  };
  walk(pkgDir);
  return out;
}

/** Problems with the package's .meta files; with `fix`, missing ones are written first. */
export function checkMetas(pkgDir, { fix = false } = {}) {
  const problems = [];
  const written = [];
  const paths = assetPaths(pkgDir);
  const want = new Set(paths.map((p) => `${p}.meta`));
  const guids = new Map();
  for (const rel of paths) {
    const file = join(pkgDir, `${rel}.meta`);
    if (!existsSync(file)) {
      if (fix) {
        writeFileSync(file, metaFor(pkgDir, rel));
        written.push(`${rel}.meta`);
      } else {
        problems.push(`missing ${rel}.meta (run node scripts/check-unity.mjs --fix-meta)`);
        continue;
      }
    }
    const m = readFileSync(file, 'utf8').match(/^guid: ([0-9a-f]{32})$/m);
    if (!m) { problems.push(`${rel}.meta has no guid`); continue; }
    if (guids.has(m[1])) problems.push(`${rel}.meta repeats the guid of ${guids.get(m[1])}.meta`);
    guids.set(m[1], rel);
  }
  // orphans: a .meta whose asset is gone
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (name.endsWith('~') || name.startsWith('.')) continue;
      const rel = relative(pkgDir, full).split('\\').join('/');
      if (name.endsWith('.meta')) { if (!want.has(rel)) problems.push(`${rel} has no asset`); }
      else if (statSync(full).isDirectory()) walk(full);
    }
  };
  walk(pkgDir);
  return { problems, written, count: paths.length };
}
