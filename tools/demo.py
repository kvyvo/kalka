"""Draws assets/demo.svg: a leafy branch, 380 × 269 mm (fits A3 landscape), our own artwork."""
import math, random
from pathlib import Path

random.seed(7)
W, H = 420, 297
out = []
P = lambda x, y: f'{x:.1f},{y:.1f}'

def stem(t):  # gentle S-curve from lower left to upper right
    x = 40 + 340 * t
    y = 230 - 150 * t + 38 * math.sin(t * math.pi * 1.6)
    return x, y

def tangent(t):
    a, b = stem(max(0, t - 1e-3)), stem(min(1, t + 1e-3))
    return math.atan2(b[1] - a[1], b[0] - a[0])

def leaf(x, y, ang, L, Wd, fill):
    c, s = math.cos(ang), math.sin(ang)
    R = lambda u, v: (x + u * c - v * s, y + u * s + v * c)
    tip, a1, a2, b1, b2 = R(L, 0), R(L * .3, -Wd), R(L * .8, -Wd * .55), R(L * .3, Wd), R(L * .8, Wd * .55)
    d = f'M{P(x, y)} C{P(*a1)} {P(*a2)} {P(*tip)} C{P(*b2)} {P(*b1)} {P(x, y)}Z'
    out.append(f'<path d="{d}" fill="{fill}" stroke="#23402B" stroke-width="1.1" stroke-linejoin="round"/>')
    out.append(f'<path d="M{P(x, y)} Q{P(*R(L * .5, Wd * .06))} {P(*R(L * .93, 0))}" fill="none" stroke="#23402B" stroke-width=".7"/>')
    for k in range(1, 6):
        u = L * k / 6.5
        for sgn in (-1, 1):
            w = Wd * .5 * math.sin(math.pi * u / L)
            out.append(f'<path d="M{P(*R(u, 0))} Q{P(*R(u + L * .08, sgn * w * .5))} {P(*R(u + L * .16, sgn * w))}" fill="none" stroke="#23402B" stroke-width=".5"/>')

# stem
pts = [stem(i / 60) for i in range(61)]
out.append('<path d="M' + ' L'.join(P(*p) for p in pts) + '" fill="none" stroke="#3A2E22" stroke-width="3.2" stroke-linecap="round"/>')
greens = ['#8FB996', '#A7C4A0', '#7FA784', '#B6CFA8', '#9CBF94']
for i in range(11):
    t = .07 + i * .085
    x, y = stem(t)
    side = 1 if i % 2 else -1
    ang = tangent(t) + side * (0.95 - .25 * t)
    size = 62 - 30 * abs(t - .45)
    leaf(x, y, ang, size, size * .34, random.choice(greens))
# berries
for i, t in enumerate([.3, .55, .8]):
    x, y = stem(t)
    for k in range(3):
        a = tangent(t) - math.pi / 2 + (k - 1) * .5
        bx, by = x + 16 * math.cos(a), y + 16 * math.sin(a)
        out.append(f'<path d="M{P(x, y)} L{P(bx, by)}" stroke="#3A2E22" stroke-width="1"/>')
        out.append(f'<circle cx="{bx:.1f}" cy="{by:.1f}" r="5.2" fill="#C8553D" stroke="#5A1F14" stroke-width="1"/>')
        out.append(f'<circle cx="{bx - 1.6:.1f}" cy="{by - 1.6:.1f}" r="1.3" fill="#F2C4B8"/>')

svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="380mm" height="{H * 380 / W:.1f}mm" viewBox="0 0 {W} {H}">'
       f'<rect width="{W}" height="{H}" fill="#fff"/>' + ''.join(out) + '</svg>\n')
Path(__file__).resolve().parent.parent.joinpath('assets/demo.svg').write_text(svg)
print(len(svg), 'bytes')
