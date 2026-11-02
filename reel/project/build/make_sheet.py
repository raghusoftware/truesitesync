"""Render a tall, cluttered generic spreadsheet (no brand UI) used in Scene 2 and Scene 4."""
import os, random
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, '..', 'screens')
F = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
FB = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
random.seed(3)

cols = [('', 50), ('Date', 120), ('Site', 170), ('Item', 230), ('Qty', 90), ('Rate', 110), ('Amount', 150), ('Paid by', 140), ('Remarks', 220)]
W = sum(c[1] for c in cols)
RH = 34
items = ['Diesel - JCB', 'Cement 53 gr', 'TMT 12mm', 'Sand (brass)', 'Labour - mason', 'Labour - helper', 'Bricks', 'Shuttering ply',
         'Tanker water', 'Binding wire', 'Aggregate 20mm', 'Extra labour', 'Paint primer', 'PVC pipe', 'Electrician', 'Transport']
sites = ['Tower B', 'Gotri Villa', 'Shed-2', 'Tower B', 'Bungalow 6', 'Wall CW']
payers = ['Cash', 'UPI', 'Ramesh', 'Site acct', 'HDFC', '??']
remarks = ['', '', 'bill pending', 'check w/ supervisor', 'photo on WA', '', 'dup?', 'old rate', 'register pg 14', '']
fills = [None] * 9 + ['#fff2a8', '#ffd6d6', '#d7f0d0', '#d6e6ff', '#ffe0b3']

N = 140
H = RH * (N + 1)
img = Image.new('RGB', (W, H), 'white')
d = ImageDraw.Draw(img)
f = ImageFont.truetype(F, 17)
fb = ImageFont.truetype(FB, 17)

def row(y, vals, font, bg=None):
    x = 0
    for (name, w), v in zip(cols, vals):
        cbg = bg if bg else random.choice(fills)
        if name == '':
            cbg = '#eef0f3'
        if cbg:
            d.rectangle([x, y, x + w, y + RH], fill=cbg)
        d.rectangle([x, y, x + w, y + RH], outline='#c9ced6')
        d.text((x + 6, y + 8), str(v)[:22], fill='#1f2933' if name != 'Amount' or '-' not in str(v) else '#c0392b', font=font)
        x += w

row(0, [c[0] for c in cols], fb, '#dfe3ea')
for i in range(N):
    q = random.randint(1, 120)
    r = random.choice([95, 380, 420, 55, 650, 900, 7, 1450, 62])
    amt = q * r
    vals = [i + 2, f'{random.randint(1, 28):02d}/{random.choice(["09", "10"])}', random.choice(sites), random.choice(items), q,
            r, ('-' if random.random() < 0.08 else '') + f'₹{amt:,}', random.choice(payers), random.choice(remarks)]
    row(RH * (i + 1), vals, f)

img.save(os.path.join(OUT, 'sheet_tall.png'))
print(img.size)
