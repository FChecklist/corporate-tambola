"""Cuts the screenshots taken by tools/sim2/pdf-shots.mjs (and header-shots.mjs) into the small JPEGs the brochure and the organizer manual print:
apps/web/public/img/doc-*.jpg. Run: python3 -I tools/make-doc-shots.py [shots folder]   (needs Pillow). The PDFs are then rebuilt with tools/make-brochure.mjs and tools/onepager/render.mjs."""
import os, sys
from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else "C:/ct/test-sites/data/ui/housie-header-logo"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "apps", "web", "public", "img")

def cut(src, name, box_frac=(0, 0, 1, 1), width=420, q=80):
    p = os.path.join(SRC, src)
    if not os.path.exists(p): print("MISSING", src); return
    im = Image.open(p).convert("RGB"); W, H = im.size
    l, t, r, b = box_frac; im = im.crop((int(W * l), int(H * t), int(W * r), int(H * b)))
    im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    im.save(os.path.join(OUT, name), "JPEG", quality=q, optimize=True); print("wrote", name, im.size)

# phone screens: the top part of each (the part a person looks at first)
for src, name in [("pdf/console-phone-step1.png", "doc-step1.jpg"), ("pdf/console-phone-step2.png", "doc-step2.jpg"), ("pdf/console-phone-step3.png", "doc-step3.jpg"),
                  ("pdf/console-phone-step4.png", "doc-step4.jpg"), ("pdf/console-phone-step6.png", "doc-step6.jpg"), ("pdf/console-phone-step7.png", "doc-step7.jpg"),
                  ("pdf/console-phone-rehearsals.png", "doc-rehearsals.jpg"), ("pdf/play-phone-checkin.png", "doc-checkin.jpg"), ("pdf/play-phone-live.png", "doc-live.jpg"),
                  ("pdf/console-phone-gameday-controls.png", "doc-gameday.jpg"), ("pdf/console-phone-after.png", "doc-after.jpg"), ("header-390-light-landing-menu-open.png", "doc-menu-phone.jpg")]:
    cut(src, name, (0, 0, 1, 1), 390)
# laptop: the landing page top (the six-item menu) and the organizer game day
cut("pdf/landing-laptop.png", "doc-landing-laptop.jpg", (0, 0, 1, 0.5), 1100, 82)
