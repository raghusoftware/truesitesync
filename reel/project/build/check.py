"""Automated QA: duration/format, caption safe zone + VO sync (captions vs no-captions diff), loudness."""
import json, os, subprocess
import numpy as np

P = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
OUT = os.path.normpath(os.path.join(P, '..'))
W, H = 1080, 1920
A_ = os.path.join(OUT, 'true_site_sync_reel_v1.mp4')
B_ = os.path.join(OUT, 'true_site_sync_reel_v1_nocaptions.mp4')

def frames(path, step=6, scale=4):
    w, h = W // scale, H // scale
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vf', f'select=not(mod(n\\,{step})),scale={w}:{h}:flags=area',
                          '-vsync', '0', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, h, w).astype(np.int16)

info = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration,size:stream=codec_name,width,height,r_frame_rate',
                                   '-of', 'json', A_], capture_output=True, text=True).stdout)
print('format', json.dumps(info))

fa, fb = frames(A_), frames(B_)
n = min(len(fa), len(fb))
words = json.load(open(os.path.join(P, 'audio', 'vo_words.json')))
bad, xs, ys = [], [], []
for i in range(n):
    t = i * 6 / 30
    d = np.abs(fa[i] - fb[i]) > 40
    if d.sum() < 30:
        continue
    yy, xx = np.where(d)
    x0, x1, y0, y1 = xx.min() * 4, xx.max() * 4, yy.min() * 4, yy.max() * 4
    xs += [x0, x1]; ys += [y0, y1]
    speaking = any(w['s'] - 0.1 <= t <= w['e'] + 0.7 for w in words)
    if x1 > W - 150 or y1 > H - 400 or y0 < 250 or not speaking:
        bad.append((round(t, 2), x0, x1, y0, y1, speaking))
print('caption extents x', min(xs), max(xs), 'y', min(ys), max(ys))
print('caption problems', bad[:10] if bad else 'none')

ln = subprocess.run(['ffmpeg', '-hide_banner', '-i', A_, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
print('loudness', [l.strip() for l in ln.splitlines()[-12:] if l.strip().startswith(('I:', 'Peak:', 'LRA:'))])
