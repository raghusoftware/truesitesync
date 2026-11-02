"""True Site Sync reel renderer.

Composites every frame in Python (PIL) and pipes them to two ffmpeg encoders:
  - with burned-in captions
  - without captions
Inputs live in ../ (clips/, keyframes/, screens/, audio/). Timings in TIMELINE below.
"""
import json, math, os, re, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
P = os.path.normpath(os.path.join(HERE, '..'))
OUTDIR = os.path.normpath(os.path.join(P, '..'))
W, H, FPS, DUR = 1080, 1920, 30, 35.0
NF = int(DUR * FPS)

# Instagram safe zone: nothing important in top 250, bottom 400, right 150
SAFE_L, SAFE_R, SAFE_T, SAFE_B = 60, W - 150, 250, H - 400
CX = (SAFE_L + SAFE_R) // 2

FONT_XB = os.path.join(P, 'fonts', 'Montserrat-800.ttf')
FONT_B = os.path.join(P, 'fonts', 'Montserrat-700.ttf')
EMOJI = '/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf'
YELLOW = (255, 212, 0)
RED = (235, 59, 47)
BRAND = (232, 84, 42)

def p(*a):
    return os.path.join(P, *a)

def ease(x):
    x = min(max(x, 0.0), 1.0)
    return 1 - (1 - x) ** 3

def ease_back(x):
    x = min(max(x, 0.0), 1.0)
    c1, c3 = 1.70158, 2.70158
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2

# ---------------------------------------------------------------- text
_font_cache = {}
def font(path, size):
    k = (path, size)
    if k not in _font_cache:
        _font_cache[k] = ImageFont.truetype(path, size)
    return _font_cache[k]

_emoji_font = ImageFont.truetype(EMOJI, 109)
_emoji_cache = {}
EMOJI_RE = re.compile('([\U0001F300-\U0001FAFF\u2600-\u27BF\u2B50\u2705\u274C\u26A1]\uFE0F?|\u2192)')
DEJAVU_B = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

def emoji_img(ch, size):
    k = (ch, size)
    if k not in _emoji_cache:
        im = Image.new('RGBA', (160, 160), (0, 0, 0, 0))
        ImageDraw.Draw(im).text((10, 10), ch, font=_emoji_font, embedded_color=True)
        im = im.crop(im.getbbox() or (0, 0, 1, 1))
        s = size / max(im.size)
        _emoji_cache[k] = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)
    return _emoji_cache[k]

def text_img(text, size, color=(255, 255, 255), fpath=None, stroke=None, shadow=True, colors=None):
    """Render one line (may include emoji) to RGBA. colors: list of per-token colours."""
    fpath = fpath or FONT_XB
    f = font(fpath, size)
    stroke = int(size * 0.09) if stroke is None else stroke
    parts = [s for s in EMOJI_RE.split(text) if s]
    pieces = []
    for i, s in enumerate(parts):
        col = colors[i] if colors and i < len(colors) else color
        if s == '\u2192':
            fa = font(DEJAVU_B, size)
            im = Image.new('RGBA', (int(size * 1.3), int(size * 1.35) + 2 * stroke), (0, 0, 0, 0))
            ImageDraw.Draw(im).text((4, stroke - size * 0.05), s, font=fa, fill=col, stroke_width=stroke, stroke_fill=(0, 0, 0))
            pieces.append(im.crop((0, 0, im.getbbox()[2] + 4, im.height)))
        elif EMOJI_RE.fullmatch(s):
            pieces.append(emoji_img(s, int(size * 0.95)))
        else:
            bb = f.getbbox(s, stroke_width=stroke)
            im = Image.new('RGBA', (bb[2] - min(bb[0], 0) + 4, int(size * 1.35) + 2 * stroke), (0, 0, 0, 0))
            ImageDraw.Draw(im).text((-min(bb[0], 0) + 2, stroke), s, font=f, fill=col, stroke_width=stroke, stroke_fill=(0, 0, 0))
            pieces.append(im)
    hgt = max(pc.height for pc in pieces)
    wid = sum(pc.width for pc in pieces) + 6 * (len(pieces) - 1)
    out = Image.new('RGBA', (wid, hgt), (0, 0, 0, 0))
    x = 0
    for pc in pieces:
        out.alpha_composite(pc, (x, (hgt - pc.height) // 2))
        x += pc.width + 6
    if shadow:
        sh = Image.new('RGBA', (out.width + 40, out.height + 40), (0, 0, 0, 0))
        a = out.getchannel('A').point(lambda v: int(v * 0.65))
        blk = Image.new('RGBA', out.size, (0, 0, 0, 255)); blk.putalpha(a)
        sh.alpha_composite(blk, (20, 26))
        sh = sh.filter(ImageFilter.GaussianBlur(9))
        sh.alpha_composite(out, (20, 20))
        out = sh
    return out

def place(canvas, im, cx, cy, scale=1.0, alpha=1.0, rot=0.0):
    if scale <= 0.01 or alpha <= 0.01:
        return
    if abs(scale - 1) > 1e-3:
        im = im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))), Image.BICUBIC)
    if rot:
        im = im.rotate(rot, resample=Image.BICUBIC, expand=True)
    if alpha < 1:
        im = im.copy(); im.putalpha(im.getchannel('A').point(lambda v: int(v * alpha)))
    canvas.alpha_composite(im, (int(cx - im.width / 2), int(cy - im.height / 2)))

def pop(t, t0, dur=0.28):
    """scale/alpha for pop-in at t0"""
    if t < t0:
        return 0, 0
    x = (t - t0) / dur
    return (ease_back(x) if x < 1 else 1.0), min(1, x * 2)

# ---------------------------------------------------------------- image helpers
def cover(im, w=W, h=H):
    return ImageOps.fit(im.convert('RGB'), (w, h), Image.LANCZOS)

def zoom(im, z, cx=0.5, cy=0.5, dx=0, dy=0):
    """crop-zoom a W×H image by factor z around (cx,cy), plus pixel offset."""
    w, h = im.size
    cw, ch = w / z, h / z
    x0 = min(max(cx * w - cw / 2 + dx, 0), w - cw)
    y0 = min(max(cy * h - ch / 2 + dy, 0), h - ch)
    return im.resize((w, h), Image.BICUBIC, box=(x0, y0, x0 + cw, y0 + ch))

def grade(im, warm):
    """warm in [-1,1]: -1 cool/desaturated, +1 warm/bright"""
    a = np.asarray(im).astype(np.float32)
    lum = a.mean(axis=2, keepdims=True)
    if warm < 0:
        k = -warm
        a = a * (1 - 0.35 * k) + lum * 0.35 * k
        a *= np.array([1 - 0.06 * k, 1.0, 1 + 0.07 * k], dtype=np.float32)
        a = (a - 128) * (1 + 0.08 * k) + 128 - 6 * k
    else:
        k = warm
        a = a * (1 + 0.12 * k) + lum * -0.12 * k
        a *= np.array([1 + 0.07 * k, 1 + 0.02 * k, 1 - 0.07 * k], dtype=np.float32)
        a = a + 8 * k
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))

def vignette():
    y, x = np.ogrid[:H, :W]
    d = np.sqrt(((x - W / 2) / (W / 2)) ** 2 + ((y - H / 2) / (H / 2)) ** 2)
    v = np.clip(1 - 0.35 * np.clip(d - 0.55, 0, None) ** 1.5, 0, 1)
    return v[..., None].astype(np.float32)
VIG = vignette()

def apply_vig(im):
    return Image.fromarray((np.asarray(im).astype(np.float32) * VIG).astype(np.uint8))

def glow_box(canvas, box, t, t0, color=YELLOW, width=7, r=22):
    if t < t0:
        return
    k = ease((t - t0) / 0.35)
    pulse = 0.75 + 0.25 * math.sin((t - t0) * 6)
    x0, y0, x1, y1 = box
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    s = 0.85 + 0.15 * k
    x0, x1 = cx + (x0 - cx) * s, cx + (x1 - cx) * s
    y0, y1 = cy + (y0 - cy) * s, cy + (y1 - cy) * s
    lay = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    d.rounded_rectangle((x0, y0, x1, y1), radius=r, outline=color + (int(255 * k * pulse),), width=width + 10)
    lay = lay.filter(ImageFilter.GaussianBlur(10))
    d = ImageDraw.Draw(lay)
    d.rounded_rectangle((x0, y0, x1, y1), radius=r, outline=color + (int(255 * k),), width=width)
    canvas.alpha_composite(lay)

def arrow(canvas, tip, t, t0, length=120, angle=200, color=YELLOW):
    if t < t0:
        return
    k = ease((t - t0) / 0.3)
    bob = 10 * math.sin((t - t0) * 7)
    a = math.radians(angle)
    tx, ty = tip[0] + math.cos(a) * bob, tip[1] + math.sin(a) * bob
    sx, sy = tx + math.cos(a) * length * k, ty + math.sin(a) * length * k
    lay = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    for wdt, col in ((20, (0, 0, 0, 150)), (11, color + (255,))):
        d.line((sx, sy, tx, ty), fill=col, width=wdt)
        for s in (-1, 1):
            b = a + s * math.radians(32)
            d.line((tx, ty, tx + math.cos(b) * 44, ty + math.sin(b) * 44), fill=col, width=wdt)
    canvas.alpha_composite(lay)

def cursor(canvas, x, y, scale=1.0):
    pts = [(0, 0), (0, 46), (12, 35), (21, 56), (30, 52), (21, 32), (37, 32)]
    pts = [(x + px * scale, y + py * scale) for px, py in pts]
    d = ImageDraw.Draw(canvas)
    d.polygon(pts, fill=(255, 255, 255, 255), outline=(0, 0, 0, 255), width=3)

# ---------------------------------------------------------------- video sources
class Clip:
    """Sequential frame reader for a video file, cover-scaled to W×H at FPS. Falls back to a still."""
    def __init__(self, path, still=None, speed=1.0):
        self.path, self.still, self.speed = path, still, speed
        self.frames = None
        if path and os.path.exists(path):
            cmd = ['ffmpeg', '-v', 'error', '-i', path, '-vf',
                   f'setpts=PTS/{speed},fps={FPS},scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H}',
                   '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']
            raw = subprocess.run(cmd, capture_output=True, check=True).stdout
            n = len(raw) // (W * H * 3)
            self.frames = [raw[i * W * H * 3:(i + 1) * W * H * 3] for i in range(n)]
        elif still:
            self.img = cover(Image.open(still))
        print('clip', path if self.frames else ('STILL ' + str(still)), len(self.frames) if self.frames else '')

    @property
    def is_video(self):
        return self.frames is not None

    @property
    def duration(self):
        return len(self.frames) / FPS if self.frames else 999

    def frame(self, t):
        if self.frames:
            i = min(max(int(t * FPS), 0), len(self.frames) - 1)
            return Image.frombytes('RGB', (W, H), self.frames[i])
        return self.img

# ---------------------------------------------------------------- load assets
def load():
    A = {}
    A['s1'] = Clip(p('clips', 's1.mp4'), p('keyframes', 'kf1.png'))
    A['s6'] = Clip(p('clips', 's6a.mp4'), p('keyframes', 'kf6.png'))
    A['s3'] = Clip(p('clips', 's3.mp4'), None)
    A['s3_stills'] = [cover(Image.open(p('keyframes', f's3_{i}.png'))) for i in range(4)
                      if os.path.exists(p('keyframes', f's3_{i}.png'))]
    A['laptop'] = Image.open(p('keyframes', 's2_spreadsheet.png')).convert('RGB')
    A['sheet'] = Image.open(p('screens', 'sheet_tall.png')).convert('RGB')
    A['dash'] = Image.open(p('screens', 'dashboard_phone_rgba.png'))
    A['mat'] = Image.open(p('screens', 'materials_phone_rgba.png'))
    A['pay'] = Image.open(p('screens', 'payments_phone_rgba.png'))
    A['labour'] = Image.open(p('screens', 'labour_grid.png')).convert('RGB')
    A['logo'] = Image.open(os.path.join(OUTDIR, '..', 'assets', 'logo.png')).convert('RGBA')
    bgsrc = cover(Image.open(p('keyframes', 'kf6.png')))
    A['blur_bg'] = grade(bgsrc.filter(ImageFilter.GaussianBlur(28)), 0.8)
    A['blur_bg'] = Image.blend(A['blur_bg'], Image.new('RGB', (W, H), (25, 18, 12)), 0.45)
    return A

# ---------------------------------------------------------------- scene renderers
def perspective_coeffs(dst, src):
    M, B = [], []
    for (x, y), (u, v) in zip(dst, src):
        M += [[x, y, 1, 0, 0, 0, -u * x, -u * y], [0, 0, 0, x, y, 1, -v * x, -v * y]]
        B += [u, v]
    return tuple(np.linalg.solve(np.array(M, float), np.array(B, float)))

LAPTOP_QUAD = [(49, 888), (1600, 1010), (1600, 2440), (73, 2597)]
SHEET_W = 900

def laptop_frame(A, scroll):
    bg = A['laptop']
    sheet = A['sheet']
    sh = SHEET_W
    y = int(scroll) % (sheet.height - sh - 40)
    crop = sheet.crop((0, y, SHEET_W, y + sh))
    crop = Image.blend(crop, Image.new('RGB', crop.size, (40, 50, 70)), 0.18)
    c = perspective_coeffs(LAPTOP_QUAD, [(0, 0), (SHEET_W, 0), (SHEET_W, sh), (0, sh)])
    w = crop.transform(bg.size, Image.PERSPECTIVE, c, Image.BICUBIC)
    m = Image.new('L', crop.size, 255).transform(bg.size, Image.PERSPECTIVE, c, Image.BICUBIC)
    out = bg.copy(); out.paste(w, (0, 0), m)
    return cover(out)

def scene1(A, t, cv):
    z = 1.0 + 0.28 * ease(t / 4.4)
    shake = max(0, 1 - t / 4.8) * 9
    dx, dy = shake * math.sin(t * 37), shake * math.cos(t * 29)
    fr = zoom(A['s1'].frame(t), z, 0.5, 0.33, dx, dy)
    return grade(fr, -0.9)

def scene1_gfx(t, cv):
    lines = [('Project done. ✅', 0.25), ('Payment received. ✅', 1.5)]
    y = 470
    for txt, t0 in lines:
        s, a = pop(t, t0)
        place(cv, text_img(txt, 74), CX, y, s, a)
        y += 120
    s, a = pop(t, 3.0)
    if a:
        red = t > 3.35
        im = text_img('Profit = ', 92)
        q = text_img('???', 104, color=RED if red else (255, 255, 255))
        sh = 9 * math.sin(t * 60) if red else 0
        total = im.width + q.width
        x0 = CX - total * s / 2
        place(cv, im, x0 + im.width * s / 2, y + 20, s, a)
        place(cv, q, x0 + im.width * s + q.width * s / 2 + sh, y + 20 + sh * 0.4, s * (1 + 0.06 * red), a, rot=sh * 0.6)

def scene2(A, t, cv):
    scroll = 260 * t + 140 * t * t
    fr = laptop_frame(A, scroll)
    fr = zoom(fr, 1.06 + 0.04 * t / 4, 0.45, 0.55)
    im = grade(fr, -0.8)
    return im

def scene2_gfx(t, cv):
    # cursor on sheet, jittering down
    cursor(cv, 610 + 8 * math.sin(t * 9), 1080 + 25 * math.sin(t * 4), 1.3)
    s, a = pop(t, 0.15)
    place(cv, text_img('Excel = control? 🤔', 84), CX, 470, s, a)

C3 = 7.7 / 4  # scene 3 cut length
def scene3(A, t, cv):
    i = min(int(t / C3), 3)
    lt = t - i * C3
    if A['s3_stills'] and len(A['s3_stills']) == 4:
        base = A['s3_stills'][i]
        fr = zoom(base, 1.05 + 0.08 * lt / C3, 0.5, 0.5, 30 * math.sin(lt * 3), 0)
    elif A['s3'].is_video:
        d = A['s3'].duration
        src_t = (i * d / 4) + lt * (d / 4) / C3
        fr = zoom(A['s3'].frame(src_t), 1.06 + 0.04 * lt, 0.5, 0.5, 6 * math.sin(lt * 23), 6 * math.cos(lt * 19))
    else:
        fr = Image.new('RGB', (W, H), (60, 60, 60))
    # whip blur on cut (first 4 frames)
    if lt < 0.13 and t > 0.05:
        k = 1 - lt / 0.13
        fr = fr.transform(fr.size, Image.AFFINE, (1, 0, 60 * k, 0, 1, 0)).filter(ImageFilter.BoxBlur(int(2 + 20 * k)))
    return grade(fr, -0.7)

def scene3_gfx(t, cv):
    s, a = pop(t, 0.1)
    place(cv, text_img('Site data →', 80), CX, 430, s, a)
    items = [('WhatsApp 📱', 0.25), ('Registers 📒', C3 + 0.25), ('Diaries 📓', 2 * C3 + 0.25)]
    y = 560
    for txt, t0 in items:
        s, a = pop(t, t0)
        place(cv, text_img(txt, 66), CX, y, s, a)
        y += 100

def scene4(A, t, cv):
    left = A['sheet'].crop((0, 1200, 760, 1200 + 1350))
    left = Image.blend(left, Image.new('RGB', left.size, (30, 35, 45)), 0.2)
    left = ImageOps.fit(left, (540, H), Image.LANCZOS)
    left = grade(left, -1.0)
    # right: live site footage, slowed, ken burns
    if A['s3'].is_video:
        d = A['s3'].duration
        rf = A['s3'].frame((t * 0.6) % d)
    elif A['s3_stills']:
        rf = A['s3_stills'][1]
    else:
        rf = A['s6'].frame(0)
    rf = zoom(rf, 1.15 + 0.05 * t / 5, 0.5, 0.5)
    rf = ImageOps.fit(rf, (540, H), Image.LANCZOS)
    rf = grade(rf, -0.3)
    fr = Image.new('RGB', (W, H))
    fr.paste(left, (0, 0)); fr.paste(rf, (540, 0))
    d = ImageDraw.Draw(fr)
    d.rectangle((536, 0, 543, H), fill=(255, 255, 255))
    return fr

def scene4_gfx(t, cv):
    # red "last updated" badge on the spreadsheet
    s, a = pop(t, 0.35)
    badge = text_img('Last updated: 7 days ago', 34, color=(255, 255, 255), fpath=FONT_B, stroke=0, shadow=False)
    bx = Image.new('RGBA', (badge.width + 36, badge.height + 18), (0, 0, 0, 0))
    ImageDraw.Draw(bx).rounded_rectangle((0, 0, bx.width - 1, bx.height - 1), radius=14, fill=RED + (240,))
    bx.alpha_composite(badge, (18, 9))
    place(cv, bx, 270, 900, s * (1 + 0.04 * math.sin(t * 6)), a)
    # live dot on right
    if t > 0.5:
        r = 14 + 4 * math.sin(t * 8)
        d = ImageDraw.Draw(cv)
        d.ellipse((575 - r, 905 - r, 575 + r, 905 + r), fill=(255, 40, 40, 255))
        place(cv, text_img('LIVE', 34, fpath=FONT_B, stroke=3, shadow=False), 640, 905)
    s, a = pop(t, 0.2)
    place(cv, text_img('Excel =', 58), 270, 470, s, a)
    place(cv, text_img('LAST WEEK ❌', 58, color=(255, 120, 110)), 270, 555, s, a)
    s, a = pop(t, 1.2)
    place(cv, text_img('Site =', 58), 735, 470, s, a)
    place(cv, text_img('TODAY ⚡', 58, color=YELLOW), 735, 555, s, a)

def phone_card(img, scale):
    return img.resize((int(img.width * scale), int(img.height * scale)), Image.LANCZOS)

def glass_panel(cv, box, alpha=1.0):
    x0, y0, x1, y1 = [int(v) for v in box]
    lay = Image.new('RGBA', cv.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    d.rounded_rectangle((x0, y0, x1, y1), radius=40, fill=(255, 255, 255, int(38 * alpha)), outline=(255, 255, 255, int(90 * alpha)), width=3)
    cv.alpha_composite(lay)

def scene5(A, t, cv):
    return A['blur_bg']

def scene5_gfx(A, t, cv):
    s, a = pop(t, 0.2)
    place(cv, text_img('Every expense →', 66), CX, 330, s, a)
    place(cv, text_img('linked to the project 🔗', 66), CX, 420, s, a)
    phone_cx = CX
    # 0-3s dashboard ; 3-5 labour grid ; 5-7 payments
    if t < 2.5:
        k = ease(t / 0.5)
        sc = 1.25 * (1 + 0.05 * t / 3)
        im = phone_card(A['dash'], sc)
        y = 1000 + (1 - k) * 700
        glass_panel(cv, (phone_cx - im.width / 2 - 24, y - im.height / 2 - 24, phone_cx + im.width / 2 + 24, y + im.height / 2 + 10), k)
        place(cv, im, phone_cx, y, 1, k)
        ox, oy = phone_cx - im.width / 2, y - im.height / 2
        # project name (header) arrow, then labour (Attendance) + materials tiles
        arrow(cv, (ox + 360 * sc, oy + 92 * sc), t, 0.8, angle=-20 + 180 + 160)
        glow_box(cv, (ox + 405 * sc, oy + 305 * sc, ox + 595 * sc, oy + 445 * sc), t, 1.5)
        glow_box(cv, (ox + 30 * sc, oy + 165 * sc, ox + 620 * sc, oy + 270 * sc), t, 2.2, color=(255, 255, 255), width=5)
    elif t < 4.2:
        lt = t - 2.5
        k = ease(lt / 0.4)
        card = A['labour'].crop((0, 0, 1080, 1180))
        card = card.resize((760, int(1180 * 760 / 1080)), Image.LANCZOS)
        rc = Image.new('L', card.size, 0); ImageDraw.Draw(rc).rounded_rectangle((0, 0, card.width - 1, card.height - 1), radius=36, fill=255)
        card = card.convert('RGBA'); card.putalpha(rc)
        z = 1 + 0.06 * lt / 2
        x = phone_cx + (1 - k) * 900
        glass_panel(cv, (x - card.width * z / 2 - 20, 1010 - card.height * z / 2 - 20, x + card.width * z / 2 + 20, 1010 + card.height * z / 2 + 20), k)
        place(cv, card, x, 1010, z, 1)
        ox, oy = x - card.width * z / 2, 1010 - card.height * z / 2
        sc = card.width * z / 1080
        glow_box(cv, (ox + 15 * sc, oy + 15 * sc, ox + 530 * sc, oy + 310 * sc), lt, 0.6)
        place(cv, text_img('Labour 👷', 50), phone_cx, 1450, *[v for v in pop(lt, 0.3)])
    else:
        lt = t - 4.2
        k = ease(lt / 0.4)
        sc = 1.25 * (1 + 0.05 * lt / 2)
        im = phone_card(A['pay'], sc)
        x = phone_cx + (1 - k) * 900
        y = 1000
        glass_panel(cv, (x - im.width / 2 - 24, y - im.height / 2 - 24, x + im.width / 2 + 24, y + im.height / 2 + 10), k)
        place(cv, im, x, y, 1, 1)
        ox, oy = x - im.width / 2, y - im.height / 2
        glow_box(cv, (ox + 18 * sc, oy + 160 * sc, ox + 628 * sc, oy + 275 * sc), lt, 0.6)
        place(cv, text_img('Material · Diesel · Purchases', 44), phone_cx, 1450, *[v for v in pop(lt, 0.3)])

S6A = 2.6

def scene6(A, t, cv):
    if t < S6A:
        fr = zoom(A['s6'].frame(t), 1.04 + 0.08 * t / 3, 0.5, 0.35)
        return grade(fr, 0.85)
    return A['blur_bg']

def scene6_gfx(A, t, cv):
    if t >= S6A:
        lt = t - S6A
        z = 1.0 + 0.3 * ease(lt / 2.5)
        im = A['dash']
        # zoom into the money row (y≈165-270 of phone crop)
        sc = 1.35
        big = phone_card(im, sc * z)
        fy = 215 * sc * z
        y = 1180 + (1 - min(1, lt * 3)) * 120
        place(cv, big, CX, y, 1, min(1, lt * 4))
        ox, oy = CX - big.width / 2, y - big.height / 2
        s = sc * z
        glow_box(cv, (ox + 30 * s, oy + 165 * s, ox + 620 * s, oy + 270 * s), lt, 1.1)
    s, a = pop(t, 0.2)
    place(cv, text_img('Know profit DURING', 70), CX, 400, s, a)
    place(cv, text_img('the project.', 70), CX, 490, s, a)
    s, a = pop(t, 1.4)
    place(cv, text_img('Not after. ✅', 78, color=YELLOW), CX, 600, s, a)

def scene7(A, t, cv):
    y = np.linspace(0, 1, H)[:, None, None]
    top = np.array([18, 22, 34], np.float32); bot = np.array([60, 26, 14], np.float32)
    g = top * (1 - y) + bot * y
    g = np.broadcast_to(g, (H, W, 3))
    return Image.fromarray(g.astype(np.uint8))

def scene7_gfx(A, t, cv):
    t = min(t, 3.7)  # hold last 0.5 s
    k = ease_back(t / 0.6) if t < 0.6 else 1
    logo = A['logo'].resize((440, 440), Image.LANCZOS)
    if t > 0:
        gl = Image.new('RGBA', (700, 700), (0, 0, 0, 0))
        ImageDraw.Draw(gl).ellipse((90, 90, 610, 610), fill=BRAND + (int(150 * min(1, t / 0.6)),))
        gl = gl.filter(ImageFilter.GaussianBlur(70))
        place(cv, gl, CX, 800, max(k, 0.01))
        place(cv, logo, CX, 800, max(k, 0.01), min(1, t / 0.3))
    name = text_img('True Site Sync', 76)
    s, a = pop(t, 0.5)
    place(cv, name, CX, 1110, s, a)
    url = 'truesitesync.com'
    n = int(len(url) * min(1, max(0, (t - 0.8) / 1.1)))
    if n:
        caret = '|' if (t < 2.0 and int(t * 4) % 2 == 0) else ''
        place(cv, text_img(url[:n] + caret, 58, color=YELLOW, fpath=FONT_B), CX, 1215)
    if t > 2.0:
        b = abs(math.sin((t - 2.0) * 5)) * 18 if t < 3.7 else 0
        s, a = pop(t, 2.0)
        place(cv, text_img('Link in bio 👆', 54), CX, 1440 - b, s, a)

SCENES = [  # (start, end, base, gfx, warm)
    (0, 4.8, scene1, lambda A, t, c: scene1_gfx(t, c)),
    (4.8, 8.0, scene2, lambda A, t, c: scene2_gfx(t, c)),
    (8.0, 15.7, scene3, lambda A, t, c: scene3_gfx(t, c)),
    (15.7, 20.0, scene4, lambda A, t, c: scene4_gfx(t, c)),
    (20.0, 26.0, scene5, scene5_gfx),
    (26.0, 30.8, scene6, scene6_gfx),
    (30.8, 35, scene7, scene7_gfx),
]

# ---------------------------------------------------------------- captions
KEY = re.compile(r"^(profit|excel|last|week|today|project|projects|true|site|sync|mid-project|project's)$", re.I)
KEY_PHRASES = [('last', 'week'), ('true', 'site', 'sync')]

def load_captions():
    path = p('audio', 'vo_words.json')
    if not os.path.exists(path):
        return []
    words = json.load(open(path))
    # mark highlights
    toks = [re.sub(r"[^\w'-]", '', w['w']).lower() for w in words]
    hl = [False] * len(words)
    for i, tk in enumerate(toks):
        if tk in ('profit', 'excel', 'today', 'project', 'mid-project'):
            hl[i] = True
        for ph in KEY_PHRASES:
            if toks[i:i + len(ph)] == list(ph):
                for j in range(len(ph)):
                    hl[i + j] = True
    for w, h in zip(words, hl):
        w['hl'] = h
    # group into chunks of ≤3 words, break on sentence punctuation or long gaps
    groups, cur = [], []
    for i, w in enumerate(words):
        cur.append(w)
        end_sent = re.search(r'[.?!,:…]$', w['w'])
        gap = (words[i + 1]['s'] - w['e']) if i + 1 < len(words) else 9
        if len(cur) >= 3 or end_sent or gap > 0.35:
            groups.append(cur); cur = []
    if cur:
        groups.append(cur)
    for gi, g in enumerate(groups):
        g_end = groups[gi + 1][0]['s'] if gi + 1 < len(groups) else g[-1]['e'] + 0.4
        for w in g:
            w['gend'] = min(g_end, g[-1]['e'] + 0.6)
    return groups

def draw_captions(groups, t, cv):
    for g in groups:
        if g[0]['s'] - 0.02 <= t < g[-1]['gend']:
            toks = []
            for w in g:
                active = t >= w['s']
                if not active:
                    continue
                col = YELLOW if w['hl'] else (255, 255, 255)
                im = text_img(w['w'].upper(), 64, color=col, stroke=8)
                pk = min(1, (t - w['s']) / 0.12)
                sc = 1.18 - 0.18 * pk if t - w['s'] < 0.12 else 1.0
                toks.append((im, sc))
            if not toks:
                return
            total = sum(im.width * 0.92 for im, _ in toks)
            x = CX - total / 2
            for im, sc in toks:
                place(cv, im, x + im.width * 0.46, 1405, sc)
                x += im.width * 0.92
            return

# ---------------------------------------------------------------- main
def main(only=None):
    A = load()
    groups = load_captions()
    enc = lambda out: subprocess.Popen(
        ['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
         '-vf', 'noise=alls=7:allf=t', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', out],
        stdin=subprocess.PIPE)
    e1 = enc(p('build', 'video_captions.mp4'))
    e2 = enc(p('build', 'video_nocaptions.mp4'))
    frames = range(NF) if only is None else [int(x * FPS) for x in only]
    for fi in frames:
        t = fi / FPS
        for (a, b, base, gfx) in SCENES:
            if a <= t < b or (b == 35 and t >= a):
                lt = t - a
                fr = base(A, lt, None)
                fr = apply_vig(fr)
                cv = fr.convert('RGBA')
                gfx(A, lt, cv)
                break
        e2.stdin.write(cv.convert('RGB').tobytes())
        draw_captions(groups, t, cv)
        out = cv.convert('RGB')
        e1.stdin.write(out.tobytes())
        if only is not None:
            out.save(p('build', f'check_{t:05.2f}.jpg'), quality=85)
        if fi % 60 == 0:
            print('frame', fi, flush=True)
    for e in (e1, e2):
        e.stdin.close(); e.wait()

if __name__ == '__main__':
    only = [float(x) for x in sys.argv[1:]] or None
    main(only)
