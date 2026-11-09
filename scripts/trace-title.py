"""Lifts the lettering "IRELAND" off a photo of the 1920 Railway Clearing House map's title
(public domain: published 1920) into assets/ireland-title.png, ink on transparent, for the
opening's cartouche, and sets it straight.

  python scripts/trace-title.py path/to/photo.png [guides.png]

1. Clean: the photo's paper is unevenly lit, so the paper's brightness is estimated around each
   pixel and the ink measured against it; the fold crease through the E is painted out.
2. Square up each letter by its longest straight lines, as with a straightedge: the foot line (the
   bottom of the shadow under the foot serifs) and the cap line (the tops of the top serifs) give
   its rotation; the outer edge of its upright gives any lean left after that. Fits drop outliers,
   so stray marks and the hatching don't count.
3. Size and set: each letter is scaled so its cap line and foot line match the others', on one
   line each, and spaced optically: the white between each pair, averaged over its height with
   counters capped, is the same for all.
4. Smooth: a light blur and re-sharpen takes the photo's grain off the outlines.

With a second argument, also saves the result with every letter's fitted lines drawn on it.
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

src = Path(sys.argv[1])
guides = Path(sys.argv[2]) if len(sys.argv) > 2 else None
out = Path(__file__).resolve().parent.parent / "assets" / "ireland-title.png"
INK = (31, 29, 26)          # --ink in styles.css
CREASE = (590, 616)         # the fold crease, by column (photo 1653 px wide)
WORD = "IRELAND"


def to_img(x):
    return Image.fromarray((np.clip(x, 0, 1) * 255).astype(np.uint8))


def from_img(im):
    return np.asarray(im).astype(np.float32) / 255


def robust_line(xs, ys, keep=2.0):
    """Least squares y = m x + c, refitted without points more than `keep` px off."""
    xs, ys = np.asarray(xs, float), np.asarray(ys, float)
    m, c = np.polyfit(xs, ys, 1)
    for _ in range(3):
        ok = np.abs(ys - (m * xs + c)) <= keep
        if ok.sum() < 6:
            break
        m, c = np.polyfit(xs[ok], ys[ok], 1)
    return m, c


# ---- 1. Clean ----
a = np.asarray(Image.open(src).convert("L")).astype(np.float32)
# The fold crease shades its columns rather than hiding them (up to 45% darker on its darkest
# line): each is brightened back by how much darker its plain paper is (above and below the
# letters) than the paper either side of the fold, so the E's engraving under it comes back.
# Only the very darkest column is filled from its corrected neighbours.
# Between its two dark lines the fold has a ridge of glare that washes the engraving out; those
# few columns are bridged from either side.
l, r = CREASE
paper_rows = np.r_[0:25, a.shape[0] - 40:a.shape[0]]
ref_l, ref_r = np.median(a[paper_rows, l]), np.median(a[paper_rows, r])
shade = []
for x in range(l + 1, r):
    ref = ref_l + (ref_r - ref_l) * (x - l) / (r - l)
    shade.append(np.median(a[paper_rows, x]) / ref)
    a[:, x] /= shade[-1]
shade = np.array(shade)
# Columns the fold has ruined, to be filled later: from its first to its last column that's
# more than 7% darker than the paper, or washed out by the ridge of glare between its lines.
ridge = [x for x in range(l + 1, r) if shade[x - l - 1] > 0.97 and any(shade[:x - l - 1] < 0.8) and any(shade[x - l:] < 0.8)]
bad = sorted(set(ridge) | {x for x in range(l + 1, r) if shade[x - l - 1] < 0.93})
ruined = list(range(min(bad), max(bad) + 1))   # one band: the columns between are washed out too
paper = Image.fromarray(a.clip(0, 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(41)).filter(ImageFilter.GaussianBlur(25))
rel = a / np.maximum(np.asarray(paper).astype(np.float32), 1)
alpha = np.clip((0.80 - rel) / 0.35, 0, 1)
# Smart fill of the ruined columns, from the engraving around them. The strokes that cross the
# fold (the E's arms, serifs and shadow) run sideways, so the fill spreads mostly sideways
# (strong coupling left and right, weak up and down): it diffuses in from the good columns
# either side. Then it's sharpened
# back to ink or paper, as engraving is, rather than left as grey.
known = np.ones(alpha.shape[1], bool)
known[ruined] = False
x0f, x1f = min(ruined) - 3, max(ruined) + 4
band = alpha[:, x0f:x1f].copy()
fill = ~known[x0f:x1f]
band[:, fill] = 0.5
WX, WY = 1.0, 0.25
for _ in range(600):
    left, right = band[:, :-2], band[:, 2:]
    up = np.vstack([band[:1, 1:-1], band[:-1, 1:-1]])
    down = np.vstack([band[1:, 1:-1], band[-1:, 1:-1]])
    new = (WX * (left + right) + WY * (up + down)) / (2 * WX + 2 * WY)
    inner_fill = fill[1:-1]
    band[:, 1:-1][:, inner_fill] = new[:, inner_fill]
sharp = np.clip((band - 0.5) * 7 + 0.5, 0, 1)
band[:, fill] = sharp[:, fill]
alpha[:, x0f:x1f] = band
# Any faint trace of the fold left in its columns (a grey line above and below the letters).
fold = alpha[:, l:r + 1]
fold[fold < 0.35] = 0
print("Filled fold columns:", ruined)
rows = np.nonzero((alpha > 0.5).sum(1) > 40)[0]
top0, bottom0 = rows[rows > 80].min() - 10, rows.max() + 10
alpha = alpha[top0:bottom0]


def runs_of(mask_cols, min_w=15):
    found, x = [], 0
    while x < len(mask_cols):
        if mask_cols[x]:
            s0 = x
            while x < len(mask_cols) and mask_cols[x]:
                x += 1
            if x - s0 > min_w:
                found.append((s0, x))
        else:
            x += 1
    return found


def letter_runs(al):
    """The letters, as runs of inked columns; a column or two of glare on the fold can split one,
    so pieces closer than 6 px are rejoined."""
    found = runs_of((al > 0.5).sum(0) > 0)
    merged = [found[0]]
    for s1, e1 in found[1:]:
        if s1 - merged[-1][1] < 6:
            merged[-1] = (merged[-1][0], e1)
        else:
            merged.append((s1, e1))
    return merged


letters = letter_runs(alpha)
assert len(letters) == len(WORD), letters
cuts = [np.pad(alpha[:, max(s0 - 4, 0):e0 + 4], 30) for s0, e0 in letters]


# ---- 2. Square up ----
def lines(g, ch):
    """Foot line, cap line (each y = m x + c) and upright edge (x = m y + c) of a letter."""
    ink = g > 0.5
    cols = np.nonzero(ink.any(0))[0]
    xs = np.arange(cols.min(), cols.max() + 1)
    bottoms = np.array([g.shape[0] - 1 - ink[::-1, x].argmax() if ink[:, x].any() else -1 for x in xs])
    tops = np.array([ink[:, x].argmax() if ink[:, x].any() else 10 ** 6 for x in xs])
    # The foot and cap lines: the columns that reach (near) the lowest and highest ink.
    low = bottoms >= np.percentile(bottoms[bottoms >= 0], 90) - 4
    high = tops <= np.percentile(tops[tops < 10 ** 6], 10) + 4
    foot = robust_line(xs[low], bottoms[low])
    cap = robust_line(xs[high], tops[high])
    upright = None
    if ch != "A":
        y0, y1 = np.polyval(cap, xs.mean()), np.polyval(foot, xs.mean())
        ys = np.arange(int(y0 + 0.3 * (y1 - y0)), int(y0 + 0.7 * (y1 - y0)))
        # The upright: the middle of the ink in each row of the stem, so a hairline beside it can't
        # pull the line off. The stem is all of an I, the left 30% of R, E, L and D, and the
        # left 20% of N (any wider takes in the N's heavy diagonal).
        x0 = cols.min()
        share = {"I": 1.0, "N": 0.2}.get(ch, 0.3)
        reach = max(4, int(share * (cols.max() - x0 + 1)))
        cents = [(y, x0 + np.average(np.arange(reach), weights=g[y, x0:x0 + reach])) for y in ys if g[y, x0:x0 + reach].sum() > 1]
        upright = robust_line([p[0] for p in cents], [p[1] for p in cents], keep=3.0)
    return foot, cap, upright


def square(g, rot, lean):
    """Undo a rotation `rot` (from the cap and foot lines) and, after it, a lean (from the upright)."""
    im = to_img(g)
    cx, cy = im.size[0] / 2, im.size[1] / 2
    dh, dv = rot, rot + lean
    A, B, D, E = np.cos(dh), -np.sin(dv), np.sin(dh), np.cos(dv)
    coeffs = (A, B, cx - A * cx - B * cy, D, E, cy - D * cx - E * cy)
    return from_img(im.transform(im.size, Image.AFFINE, coeffs, resample=Image.BICUBIC))


def level(g, ch):
    """Undo a keystone: stretch each column so the cap and foot lines both run level."""
    foot, cap, _ = lines(g, ch)
    cols = np.nonzero((g > 0.5).any(0))[0]
    xm = (cols.min() + cols.max()) / 2
    c0, f0 = np.polyval(cap, xm), np.polyval(foot, xm)
    rows = np.arange(g.shape[0], dtype=float)
    outg = np.zeros_like(g)
    for x in range(g.shape[1]):
        cx, fx = np.polyval(cap, x), np.polyval(foot, x)
        src_rows = cx + (rows - c0) * (fx - cx) / (f0 - c0)
        outg[:, x] = np.interp(src_rows, rows, g[:, x], left=0, right=0)
    return outg


fixed = []
for ch, g in zip(WORD, cuts):
    foot, cap, upright = lines(g, ch)
    rot = np.arctan((foot[0] + cap[0]) / 2)
    # The upright's slope, measured in the original: what's left once the rotation is out.
    lean = 0.0 if upright is None else -np.arctan(upright[0]) - rot
    fixed.append(level(square(g, rot, lean), ch))
    print(f"{ch}: rotated {np.degrees(rot):+.2f} deg, then lean {np.degrees(lean):+.2f} deg")

# ---- 3. Size and set ----
measured = [lines(g, ch) for ch, g in zip(WORD, fixed)]
heights = []
for g, (foot, cap, _) in zip(fixed, measured):
    cols = np.nonzero((g > 0.5).any(0))[0]
    xm = (cols.min() + cols.max()) / 2
    heights.append(np.polyval(foot, xm) - np.polyval(cap, xm))
height = int(round(np.median(heights)))
glyphs = []
for g, (foot, cap, _), h in zip(fixed, measured, heights):
    k = height / h
    cols = np.nonzero((g > 0.5).any(0))[0]
    xm = (cols.min() + cols.max()) / 2
    capy = np.polyval(cap, xm)
    g = g[:, cols.min():cols.max() + 1]
    im = to_img(g).resize((max(1, round(g.shape[1] * k)), max(1, round(g.shape[0] * k))), Image.LANCZOS)
    glyphs.append((from_img(im), int(round(capy * k))))


def profiles(g, t):
    ink = g[t:t + height] > 0.5
    has = ink.any(1)
    left = np.where(has, ink.argmax(1), 10 ** 6)
    right = np.where(has, g.shape[1] - 1 - ink[:, ::-1].argmax(1), -(10 ** 6))
    return left, right


GAPCAP = 0.35 * height
def mean_gap(d, right_prof, left_prof):
    gap = d + left_prof - right_prof
    ok = (left_prof < 10 ** 6) & (right_prof > -(10 ** 6))
    return np.minimum(gap[ok], GAPCAP).mean()


profs = [profiles(g, t) for g, t in glyphs]
scale0 = height / np.median(heights)
olds = [(letters[i + 1][0] - letters[i][0]) * scale0 for i in range(len(letters) - 1)]
target = np.mean([mean_gap(olds[i], profs[i][1], profs[i + 1][0]) for i in range(len(glyphs) - 1)])
xs = [0]
for i in range(len(glyphs) - 1):
    lo, hi = 0.0, 4.0 * height
    for _ in range(40):
        m = (lo + hi) / 2
        lo, hi = (m, hi) if mean_gap(m, profs[i][1], profs[i + 1][0]) < target else (lo, m)
    xs.append(xs[-1] + round(hi))

pad = 8
over = max(t for _, t in glyphs) + pad
under = max(g.shape[0] - t for g, t in glyphs) + pad
canvas = np.zeros((over + under, xs[-1] + glyphs[-1][0].shape[1] + 2 * pad), np.float32)
for x, (g, t) in zip(xs, glyphs):
    y = over - t
    region = canvas[y:y + g.shape[0], pad + x:pad + x + g.shape[1]]
    np.maximum(region, g[:region.shape[0], :region.shape[1]], out=region)
ink_rows = np.nonzero((canvas > 0.1).sum(1))[0]
ink_cols = np.nonzero((canvas > 0.1).sum(0))[0]
y_off, x_off = max(ink_rows.min() - pad, 0), max(ink_cols.min() - pad, 0)
canvas = canvas[y_off:ink_rows.max() + pad, x_off:ink_cols.max() + pad]
capline, footline = over - y_off, over - y_off + height

# ---- 4. Smooth ----
soft = from_img(to_img(canvas).filter(ImageFilter.GaussianBlur(0.6)))
alpha = np.clip((soft - 0.1) / 0.75, 0, 1)

rgba = np.zeros(alpha.shape + (4,), np.uint8)
rgba[..., 0], rgba[..., 1], rgba[..., 2] = INK
rgba[..., 3] = (alpha * 255).round().astype(np.uint8)
out.parent.mkdir(exist_ok=True)
Image.fromarray(rgba, "RGBA").save(out, optimize=True)
print(f"Saved {out.name}: {rgba.shape[1]} x {rgba.shape[0]}; cap height {height} px")

if guides:
    # The result, twice the size, with each letter's lines re-fitted on it: the cap and foot
    # lines in red, the shared cap line and baseline in blue, each upright in green.
    final = alpha
    S = 2
    bg = Image.new("RGBA", (final.shape[1], final.shape[0]), (247, 243, 230, 255))
    bg.alpha_composite(Image.fromarray(rgba, "RGBA"))
    bg = bg.convert("RGB").resize((final.shape[1] * S, final.shape[0] * S), Image.LANCZOS)
    d = ImageDraw.Draw(bg)
    for y in (capline, footline):
        d.line([(0, y * S), (bg.size[0], y * S)], fill=(40, 110, 220))
    report = []
    for (s0, e0), ch in zip(letter_runs(final), WORD):
        g = np.pad(final[:, s0:e0], 30)
        foot, cap, upright = lines(g, ch)
        for m, c in (foot, cap):
            d.line([((s0) * S, (m * 30 + c - 30) * S), ((e0) * S, (m * (e0 - s0 + 30) + c - 30) * S)], fill=(220, 40, 40))
        msg = f"{ch}: cap {np.degrees(np.arctan(cap[0])):+.2f} deg at y {np.polyval(cap, 30 + (e0 - s0) / 2) - 30:.1f}, foot {np.degrees(np.arctan(foot[0])):+.2f} deg at y {np.polyval(foot, 30 + (e0 - s0) / 2) - 30:.1f}"
        if upright is not None:
            ya, yb = capline, footline
            xa, xb = np.polyval(upright, ya + 30) - 30 + s0, np.polyval(upright, yb + 30) - 30 + s0
            d.line([(xa * S, ya * S), (xb * S, yb * S)], fill=(30, 150, 60))
            msg += f", upright {np.degrees(np.arctan(upright[0])):+.2f} deg"
        report.append(msg)
    bg.save(guides)
    print("\n".join(report))
