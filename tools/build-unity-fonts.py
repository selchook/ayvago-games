"""Build the Unity package's fonts (unity/com.ayvago.sdk/Fonts/) as full TTFs with Turkish.

The studio has these fonts only as @fontsource woff2 subsets; Unity (legacy Font and TextMeshPro
font asset generation) needs whole TrueType files. Sources, all SIL OFL 1.1:
  - Nunito, Pixelify Sans, Press Start 2P: the static TTFs Google Fonts serves, as published in the
    npm packages @expo-google-fonts/nunito 0.4.2, @expo-google-fonts/pixelify-sans 0.4.2 and
    @expo-google-fonts/press-start-2p 0.4.1. Copied byte for byte (unmodified).
  - Fredoka: Google Fonts' upstream variable font (github.com/google/fonts, ofl/fredoka,
    Fredoka[wdth,wght].ttf). Unity cannot pick a variable font's weight, so the SemiBold (600) and
    Bold (700) static instances are cut from it with fontTools' instancer at width 100, exactly as
    Google Fonts makes its static files; the outlines are not otherwise changed. Fredoka has no
    Reserved Font Name. Fredoka has no ğ Ğ İ ş Ş at all (upstream, and in the studio's web fonts):
    Unity takes them from Nunito Bold (the importer's fallback, set in Fredoka-*.ttf.meta).
  - Ayvago Pixel TR: the studio's own three-glyph face (src/core/fonts/ayvago-pixel-tr.woff, built by
    tools/build-tr-font.py) re-wrapped from WOFF to TTF; it goes in front of Press Start 2P.

Usage:
  mkdir -p /tmp/fonts && cd /tmp/fonts
  npm pack @expo-google-fonts/nunito@0.4.2 @expo-google-fonts/pixelify-sans@0.4.2 @expo-google-fonts/press-start-2p@0.4.1
  for f in *.tgz; do mkdir -p "${f%.tgz}" && tar xzf "$f" -C "${f%.tgz}"; done
  curl -o 'Fredoka[wdth,wght].ttf' 'https://raw.githubusercontent.com/google/fonts/main/ofl/fredoka/Fredoka%5Bwdth,wght%5D.ttf'
  for f in fredoka nunito pixelifysans pressstart2p; do curl -o "OFL-$f.txt" "https://raw.githubusercontent.com/google/fonts/main/ofl/$f/OFL.txt"; done
  python3 tools/build-unity-fonts.py /tmp/fonts
"""
import os
import shutil
import sys

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'unity', 'com.ayvago.sdk', 'Fonts')
TURKISH = 'çÇğĞıİöÖşŞüÜ'

COPIES = {
    'Nunito-Bold.ttf': 'expo-google-fonts-nunito-0.4.2/package/700Bold/Nunito_700Bold.ttf',
    'Nunito-ExtraBold.ttf': 'expo-google-fonts-nunito-0.4.2/package/800ExtraBold/Nunito_800ExtraBold.ttf',
    'PixelifySans-Regular.ttf': 'expo-google-fonts-pixelify-sans-0.4.2/package/400Regular/PixelifySans_400Regular.ttf',
    'PixelifySans-Bold.ttf': 'expo-google-fonts-pixelify-sans-0.4.2/package/700Bold/PixelifySans_700Bold.ttf',
    'PressStart2P-Regular.ttf': 'expo-google-fonts-press-start-2p-0.4.1/package/400Regular/PressStart2P_400Regular.ttf',
}
FREDOKA = {'Fredoka-SemiBold.ttf': 600, 'Fredoka-Bold.ttf': 700}
LICENSES = [
    ('Fredoka (Fredoka-SemiBold.ttf, Fredoka-Bold.ttf)', 'OFL-fredoka.txt'),
    ('Nunito (Nunito-Bold.ttf, Nunito-ExtraBold.ttf)', 'OFL-nunito.txt'),
    ('Pixelify Sans (PixelifySans-Regular.ttf, PixelifySans-Bold.ttf)', 'OFL-pixelifysans.txt'),
    ('Press Start 2P (PressStart2P-Regular.ttf)', 'OFL-pressstart2p.txt'),
]


def main(src):
    os.makedirs(OUT, exist_ok=True)
    for name, rel in COPIES.items():
        shutil.copyfile(os.path.join(src, rel), os.path.join(OUT, name))
    for name, weight in FREDOKA.items():
        font = TTFont(os.path.join(src, 'Fredoka[wdth,wght].ttf'))
        instancer.instantiateVariableFont(font, {'wght': weight, 'wdth': 100}, inplace=True, updateFontNames=True)
        font.save(os.path.join(OUT, name))
    tr = TTFont(os.path.join(ROOT, 'src', 'core', 'fonts', 'ayvago-pixel-tr.woff'))
    tr.flavor = None
    tr.save(os.path.join(OUT, 'AyvagoPixelTR.ttf'))

    parts = ['The fonts in this folder are licensed under the SIL Open Font License, Version 1.1.\n'
             'Each family\'s copyright notice and license follow.\n']
    for title, file in LICENSES:
        with open(os.path.join(src, file), encoding='utf-8') as f:
            parts.append('=' * 78 + '\n' + title + '\n' + '=' * 78 + '\n\n' + f.read().strip() + '\n')
    with open(os.path.join(ROOT, 'src', 'core', 'fonts', 'OFL.txt'), encoding='utf-8') as f:
        studio = f.read().strip()
    parts.append('=' * 78 + '\nAyvago Pixel TR (AyvagoPixelTR.ttf): a Modified Version of Press Start 2P with its own\n'
                 'family name (tools/build-tr-font.py in selchook/ayvago-games)\n' + '=' * 78 + '\n\n' + studio + '\n')
    with open(os.path.join(OUT, 'OFL.txt'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(parts))

    for name in sorted(os.listdir(OUT)):
        if not name.endswith('.ttf'):
            continue
        cmap = TTFont(os.path.join(OUT, name)).getBestCmap()
        missing = ''.join(c for c in TURKISH if ord(c) not in cmap)
        print(f'{name:28} {os.path.getsize(os.path.join(OUT, name)) // 1024:4} KB  Turkish missing: {missing or "none"}')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
