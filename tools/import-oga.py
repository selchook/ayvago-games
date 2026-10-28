"""Import CC0 audio packs downloaded from OpenGameArt into public/assets/oga/<pack>/.

Usage: python3 tools/import-oga.py <pack> <zip> [--music]
Every file is re-encoded to .ogg (Vorbis) and .mp3 (Safari) with lowercase, dash-separated
names. Sound effects are mono; music keeps stereo at a lower bitrate. Record every pack in
docs/assets/LICENSES.md (source page, author, license) before using it.
"""
import os, re, subprocess, sys, tempfile, zipfile

AUDIO = ('.wav', '.ogg', '.mp3', '.flac')
DST_ROOT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'oga')


def norm(part):
    part = re.sub(r'\[[^\]]*\]', '', part)          # "[512 sounds]", "[Chiptune Adventures]"
    part = re.sub(r'(?i)\bby juhani junkala\b|\bjuhani junkala\b', '', part)
    part = re.sub(r'[^a-zA-Z0-9]+', '-', part).strip('-').lower()
    return part or 'x'


def main():
    pack, archive = sys.argv[1], sys.argv[2]
    music = '--music' in sys.argv
    dst = os.path.join(DST_ROOT, pack)
    with zipfile.ZipFile(archive) as z, tempfile.TemporaryDirectory() as tmp:
        for info in z.infolist():
            name = info.filename
            if info.is_dir() or not name.lower().endswith(AUDIO) or '..' in name or name.startswith('/'):
                continue
            parts = name.split('/')
            # Drop the archive's own top folder ("The Essential … Collection/").
            if len(parts) > 1 and not music:
                parts = parts[1:]
            rel = '/'.join(norm(p) for p in parts[:-1])
            base = norm(os.path.splitext(parts[-1])[0])
            out_dir = os.path.join(dst, rel)
            os.makedirs(out_dir, exist_ok=True)
            src = z.extract(info, tmp)
            out = os.path.join(out_dir, base)
            channels = [] if music else ['-ac', '1']
            ogg_q = '3' if music else '4'
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, *channels, '-c:a', 'libvorbis', '-q:a', ogg_q, out + '.ogg'], check=True)
            mp3 = ['-b:a', '96k'] if music else ['-q:a', '5']
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', src, *channels, '-c:a', 'libmp3lame', *mp3, out + '.mp3'], check=True)
            print(os.path.relpath(out, DST_ROOT))


if __name__ == '__main__':
    main()
