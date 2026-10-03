"""Makes the app icons for the installable game (run once: python tools/make-icons.py)."""
import os, random
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), "..", "apps", "web", "public")

def mk(size, pad):
    im = Image.new("RGB", (size, size), "#0B3D91")
    d = ImageDraw.Draw(im)
    inner = size * (1 - 2 * pad)
    x0 = size * pad
    d.rounded_rectangle([x0, x0 + inner * 0.12, x0 + inner, x0 + inner * 0.88], radius=inner * 0.08, fill="#FFFDF9")
    cw = inner / 9
    ch = inner * 0.76 / 3
    random.seed(7)
    for r in range(3):
        for c in random.sample(range(9), 5):
            cx = x0 + cw * c + cw / 2
            cy = x0 + inner * 0.12 + ch * r + ch / 2
            rad = min(cw, ch) * 0.36
            d.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], fill="#C9A24A" if (r + c) % 3 == 0 else "#0B3D91")
    return im

for name, size, pad in [("icon-192.png", 192, 0.08), ("icon-512.png", 512, 0.08), ("icon-maskable-512.png", 512, 0.20), ("apple-touch-icon.png", 180, 0.08)]:
    mk(size, pad).save(os.path.join(OUT, name), optimize=True)
    print("wrote", name)
