"""Draws the Corporate Tambola badge (the owner's logo: red rounded square with a Tambola ticket) from logo-mark.svg's own shapes into the PNG sizes. Run: python3 -I tools/make-icons.py [public dir]. (The older version of this script drew the previous blue logo; do not restore it.)"""
import re, sys, os
from PIL import Image, ImageDraw, ImageFont
PUB = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "apps", "web", "public")
svg = open(os.path.join(PUB, "logo-mark.svg"), encoding="utf8").read()
BG = (0xE2, 0x3E, 0x57, 255)
K = 16  # draw at 1024 (64*16)
def col(h): h = h.lstrip("#"); return tuple(int(h[i:i+2], 16) for i in (0, 2, 4)) + (255,)
def ticket_layer(k):
    L = Image.new("RGBA", (64 * k, 64 * k), (0, 0, 0, 0)); d = ImageDraw.Draw(L)
    g = re.search(r'<g transform="rotate\(-7 32 32\)">(.*)</g>', svg, re.S).group(1)
    for m in re.finditer(r'<rect ([^>]*)/>|<text ([^>]*)>([^<]*)</text>', g):
        if m.group(1):
            a = dict(re.findall(r'([a-z-]+)="([^"]*)"', m.group(1)))
            x, y, w, h = (float(a[n]) * k for n in ("x", "y", "width", "height"))
            sw = float(a.get("stroke-width", 0)) * k
            box = [x, y, x + w, y + h]
            if "rx" in a: d.rounded_rectangle(box, radius=float(a["rx"]) * k, fill=col(a["fill"]), outline=col(a["stroke"]), width=max(1, round(sw)))
            else: d.rectangle(box, fill=col(a["fill"]), outline=col(a["stroke"]) if "stroke" in a else None, width=max(1, round(sw)) if "stroke" in a else 0)
        else:
            a = dict(re.findall(r'([a-z-]+)="([^"]*)"', m.group(2)))
            f = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", round(float(a["font-size"]) * k))
            d.text((float(a["x"]) * k, float(a["y"]) * k), m.group(3), font=f, fill=col(a["fill"]), anchor="ms")
    return L.rotate(7, resample=Image.BICUBIC, center=(32 * k, 32 * k))
T = ticket_layer(K)
def badge(size, mode):
    """mode: round (transparent corners), full (full-bleed red, ticket at 100%), maskable (full-bleed red, ticket in the 60% safe zone)."""
    base = Image.new("RGBA", (64 * K, 64 * K), (0, 0, 0, 0)); d = ImageDraw.Draw(base)
    if mode == "round": d.rounded_rectangle([0, 0, 64 * K - 1, 64 * K - 1], radius=14 * K, fill=BG); base.alpha_composite(T)
    else:
        d.rectangle([0, 0, 64 * K, 64 * K], fill=BG)
        s = 0.60 if mode == "maskable" else 0.80
        t = T.resize((round(64 * K * s),) * 2, Image.LANCZOS); o = (64 * K - t.width) // 2; base.alpha_composite(t, (o, o))
    return base.resize((size, size), Image.LANCZOS)
out = [("logo-1024.png", 1024, "round"), ("logo-512.png", 512, "round"), ("icon-512.png", 512, "round"), ("icon-192.png", 192, "round"), ("favicon-32.png", 32, "round"),
       ("icon-maskable-512.png", 512, "maskable"), ("icon-maskable-192.png", 192, "maskable"), ("apple-touch-icon.png", 180, "full")]
for n, s, m in out:
    im = badge(s, m)
    if m != "round" and n.startswith("apple"): im = im.convert("RGB")
    im.save(os.path.join(PUB, n), optimize=True); print("wrote", n, s, m)
