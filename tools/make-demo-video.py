"""Makes apps/web/public/demo-break.mp4: the short explainer that plays in the free demo's break.
15 seconds (the software's shortest break), 1280x720: two on-screen messages, a female Indian English voice (Microsoft Neerja neural voice via the edge-tts package),
a simple synthesised background music bed (no sampled music, so nothing to license), and a closing line. Re-run after changing the words below:

    python -m venv %TEMP%\\tambola-media-venv
    %TEMP%\\tambola-media-venv\\Scripts\\pip install edge-tts imageio-ffmpeg pillow numpy
    %TEMP%\\tambola-media-venv\\Scripts\\python tools\\make-demo-video.py

Honest note: the voice comes from Microsoft's online neural voice service through an unofficial package. If you want a voice you fully own, record the three
sentences yourself and replace VOICE_FILES, or replace the finished MP4 (nothing else depends on how it was made).
"""
import asyncio, math, os, subprocess, sys, tempfile, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import edge_tts, imageio_ffmpeg

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "apps", "web", "public", "demo-break.mp4")
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
W, H, FPS, TOTAL = 1280, 720, 25, 15.0
SR = 44100
VOICE, RATE = "en-IN-NeerjaNeural", "-2%"  # female, Indian English, calm pace

# what is said, and what is shown while it is said (same meaning, shown in short lines)
LINES = [
    ("Play your brand message, video or audio, in a break.",
     "You can play your brand / message video or audio in a break"),
    ("Play up to ten, at equal intervals. You choose how many.",
     "You can play up to 10 brand / message videos or audio, in equal-interval breaks. You decide the number and the breaks."),
    ("Try it in Brand moments.",
     "Try it in Brand moments"),
]
NAVY, GOLD, WHITE, SOFT = (11, 61, 145), (201, 162, 74), (255, 255, 255), (190, 208, 240)
tmp = tempfile.mkdtemp(prefix="tambola-video-")


def run(cmd):
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def to_wav(src, dst):
    run([FFMPEG, "-y", "-i", src, "-ar", str(SR), "-ac", "1", dst])


def read_wav(path):
    with wave.open(path, "rb") as w:
        raw = w.readframes(w.getnframes())
        return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0


async def speak():
    paths = []
    for i, (say, _) in enumerate(LINES):
        mp3 = os.path.join(tmp, f"v{i}.mp3"); wav = os.path.join(tmp, f"v{i}.wav")
        await edge_tts.Communicate(say, VOICE, rate=RATE).save(mp3)
        to_wav(mp3, wav); paths.append(wav)
    return [read_wav(p) for p in paths]


def build_voice(chunks):
    track = np.zeros(int(TOTAL * SR), dtype=np.float32)
    starts, t = [], 0.5
    for i, c in enumerate(chunks):
        c = c / (np.max(np.abs(c)) + 1e-6) * 0.9
        a = int(t * SR); track[a:a + len(c)] += c[: max(0, len(track) - a)]
        starts.append((t, t + len(c) / SR))
        t += len(c) / SR + (0.40 if i == 0 else 0.30)
    return track, starts


def music():
    """Soft pad + gentle arpeggio over four chords (C, G, Am, F); slow attack, long release; quiet."""
    n = int(TOTAL * SR); t = np.arange(n) / SR; out = np.zeros(n, dtype=np.float32)
    chords = [(261.63, 329.63, 392.0), (196.0, 246.94, 392.0), (220.0, 261.63, 329.63), (174.61, 261.63, 349.23)]
    seg = TOTAL / len(chords)
    for ci, ch in enumerate(chords):
        a, b = int(ci * seg * SR), int(min(n, (ci + 1) * seg * SR + 0.8 * SR)); tt = t[a:b] - t[a]
        env = np.minimum(1, tt / 0.7) * np.exp(-np.maximum(0, tt - seg) * 2.5)
        for f in ch:
            out[a:b] += (0.060 * np.sin(2 * math.pi * f * tt) + 0.035 * np.sin(2 * math.pi * f * 1.003 * tt) + 0.02 * np.sin(2 * math.pi * f * 2 * tt)) * env
    notes = [523.25, 659.25, 783.99, 659.25]
    for k in range(int(TOTAL / 0.5)):
        a = int(k * 0.5 * SR); tt = np.arange(int(0.9 * SR)) / SR; f = notes[(k + k // 4) % 4] * (1.0 if (k // 8) % 2 == 0 else 0.75)
        end = min(n, a + len(tt)); out[a:end] += (0.05 * np.sin(2 * math.pi * f * tt) * np.exp(-tt * 4.5))[: end - a]
    out *= np.minimum(1, t / 0.8) * np.minimum(1, (TOTAL - t) / 1.2)
    return out / (np.max(np.abs(out)) + 1e-6) * 0.30


def font(sz, bold=True):
    for p in (r"C:\Windows\Fonts\segoeuib.ttf" if bold else r"C:\Windows\Fonts\segoeui.ttf", "arialbd.ttf" if bold else "arial.ttf"):
        try: return ImageFont.truetype(p, sz)
        except Exception: pass
    return ImageFont.load_default()


def wrap(d, text, f, maxw):
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if d.textlength(trial, font=f) <= maxw: cur = trial
        else: lines.append(cur); cur = w
    return lines + [cur]


def ease(x): x = max(0.0, min(1.0, x)); return x * x * (3 - 2 * x)


def frame(tsec, spans):
    img = Image.new("RGB", (W, H), NAVY); d = ImageDraw.Draw(img, "RGBA")
    d.rectangle([0, H - 10, W, H], fill=GOLD + (255,))
    d.text((56, 44), "Corporate Tambola", font=font(30), fill=SOFT + (255,))
    for i, (a, b) in enumerate(spans):
        show0, show1 = a - 0.25, (spans[i + 1][0] - 0.25 if i + 1 < len(spans) else TOTAL + 1)
        if not (show0 <= tsec < show1): continue
        k = ease((tsec - show0) / 0.5); off = int((1 - k) * 26); alpha = int(255 * k)
        text = LINES[i][1]; sz = 62 if i != 1 else 46; f = font(sz)
        lines = wrap(d, text, f, W - 220); lh = int(sz * 1.28); y = 250 - (len(lines) - 1) * lh // 2 + off
        if i == 2: y = 300 + off
        for ln in lines:
            w = d.textlength(ln, font=f); d.text(((W - w) / 2, y), ln, font=f, fill=WHITE + (alpha,)); y += lh
        d.rounded_rectangle([W / 2 - 60, y + 14, W / 2 + 60, y + 20], radius=3, fill=GOLD + (alpha,))
        if i == 0:  # a play button
            cx, cy = W / 2, 520; d.ellipse([cx - 52, cy - 52, cx + 52, cy + 52], outline=GOLD + (alpha,), width=5)
            d.polygon([(cx - 14, cy - 24), (cx - 14, cy + 24), (cx + 26, cy)], fill=GOLD + (alpha,))
        if i == 1:  # a game line with ten break marks, equally spaced, lighting up one by one
            x0, x1, yy = 170, W - 170, 560; d.rounded_rectangle([x0, yy - 4, x1, yy + 4], radius=4, fill=SOFT + (int(alpha * 0.45),))
            span = max(0.5, b - a)
            for m in range(10):
                x = x0 + (x1 - x0) * (m + 0.5) / 10; lit = tsec >= a + span * 0.15 + m * (span * 0.7 / 10)
                r = 17 if lit else 10
                d.ellipse([x - r, yy - r, x + r, yy + r], fill=(GOLD if lit else SOFT) + (alpha,))
    return img


def main():
    chunks = asyncio.run(speak())
    voice, spans = build_voice(chunks)
    print("voice spans (s):", [(round(a, 2), round(b, 2)) for a, b in spans])
    if spans[-1][1] > TOTAL - 0.4: sys.exit("The voice does not fit in %.0f seconds: shorten the words." % TOTAL)
    mix = np.clip(voice + music(), -1, 1)
    wav = os.path.join(tmp, "mix.wav")
    with wave.open(wav, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype(np.int16).tobytes())
    os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
    p = subprocess.Popen([FFMPEG, "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-i", wav,
                          "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "medium", "-crf", "28", "-c:a", "aac", "-b:a", "96k",
                          "-movflags", "+faststart", "-t", str(TOTAL), OUT], stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for n in range(int(TOTAL * FPS)):
        p.stdin.write(frame(n / FPS, spans).tobytes())
    p.stdin.close(); p.wait()
    frame(2.5, spans).save(os.path.join(tmp, "f1.png")); frame(8.5, spans).save(os.path.join(tmp, "f2.png")); frame(13.0, spans).save(os.path.join(tmp, "f3.png"))
    print("wrote", os.path.abspath(OUT), os.path.getsize(OUT) // 1024, "KB; preview frames in", tmp)


main()



