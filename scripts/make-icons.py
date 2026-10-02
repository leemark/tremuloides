"""Generates public/icon.svg and the PNG app icons (run once; outputs are committed).

A stylized quaking-aspen leaf in gold on a near-black rounded square.
"""
import math
from pathlib import Path
from PIL import Image, ImageDraw

BG = (14, 15, 17)
GOLD = (233, 184, 37)
VEIN = (150, 104, 12)
OUT = Path(__file__).resolve().parent.parent / "public"


def leaf_outline(n=240):
    """Leaf in unit coords: base at (0, 0.42), tip at (0, -0.46). Returns (x, y) points."""
    pts_right = []
    for i in range(n + 1):
        v = i / n  # 0 = base, 1 = tip
        w = 0.40 * math.sin(math.pi * (v ** 0.78)) ** 0.85 * (1 - 0.25 * v)
        # fine crenate teeth along the edge (not at the very tip/base)
        teeth = 1 + 0.035 * abs(math.sin(v * math.pi * 11)) * math.sin(math.pi * v)
        w *= teeth
        y = 0.42 - v * 0.88
        pts_right.append((w, y))
    left = [(-x, y) for x, y in reversed(pts_right)]
    return pts_right + left[1:]


def rotate(pts, deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return [(x * c - y * s, x * s + y * c) for x, y in pts]


def half_width(y):
    v = (0.42 - y) / 0.88
    v = min(1.0, max(0.0, v))
    return 0.40 * math.sin(math.pi * (v ** 0.78)) ** 0.85 * (1 - 0.25 * v)


def veins():
    lines = [[(0, 0.42), (0, -0.40)]]
    for y0, ang in [(0.30, 26), (0.14, 34), (-0.02, 40), (-0.17, 46)]:
        t = math.tan(math.radians(ang))
        x = half_width(y0)
        for _ in range(20):  # shrink until the vein end sits inside the outline
            if x <= 0.8 * half_width(y0 - x * t):
                break
            x *= 0.93
        for side in (1, -1):
            lines.append([(0, y0), (side * x, y0 - x * t)])
    return lines


def stem():
    return [(0, 0.42), (0.03, 0.52), (0.08, 0.60)]


ANGLE = -18


def to_px(pts, size, scale, cx=0.5, cy=0.47):
    return [(size * (cx + x * scale), size * (cy + y * scale)) for x, y in pts]


def draw_icon(size, scale, rounded=True, ss=4):
    S = size * ss
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=BG + (255,))
    else:
        d.rectangle([0, 0, S, S], fill=BG + (255,))
    d.line(to_px(rotate(stem(), ANGLE), S, scale), fill=GOLD + (255,), width=max(2, int(S * 0.028 * scale)), joint="curve")
    d.polygon(to_px(rotate(leaf_outline(), ANGLE), S, scale), fill=GOLD + (255,))
    for ln in veins():
        d.line(to_px(rotate(ln, ANGLE), S, scale), fill=VEIN + (255,), width=max(1, int(S * 0.012 * scale)))
    return img.resize((size, size), Image.LANCZOS)


def svg():
    def path(pts):
        p = to_px(pts, 512, 0.82)
        return "M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in p) + " Z"

    def poly(pts):
        p = to_px(pts, 512, 0.82)
        return " ".join(f"{x:.1f},{y:.1f}" for x, y in p)

    vein_lines = "".join(
        f'<polyline points="{poly(rotate(v, ANGLE))}" fill="none" stroke="#96680c" stroke-width="5" stroke-linecap="round"/>' for v in veins()
    )
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">'
        '<rect width="512" height="512" rx="112" fill="#0e0f11"/>'
        f'<polyline points="{poly(rotate(stem(), ANGLE))}" fill="none" stroke="#e9b825" stroke-width="12" stroke-linecap="round"/>'
        f'<path d="{path(rotate(leaf_outline(), ANGLE))}" fill="#e9b825"/>'
        f"{vein_lines}</svg>\n"
    )


if __name__ == "__main__":
    (OUT / "icons").mkdir(parents=True, exist_ok=True)
    (OUT / "icon.svg").write_text(svg())
    draw_icon(192, 0.82).save(OUT / "icons/icon-192.png")
    draw_icon(512, 0.82).save(OUT / "icons/icon-512.png")
    draw_icon(512, 0.62, rounded=False).save(OUT / "icons/maskable-512.png")
    draw_icon(180, 0.74, rounded=False).save(OUT / "icons/apple-touch-icon.png")
    draw_icon(48, 0.86).save(OUT / "icons/favicon-48.png")
    print("icons written")
