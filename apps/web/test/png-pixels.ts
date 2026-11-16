// A tiny PNG reader for tests (8-bit RGB or RGBA, not interlaced): size and the colour of one pixel, so a test can tell the real logo from an old or wrong picture.
import { inflateSync } from "node:zlib";
export function readPng(bytes: Uint8Array): { w: number; h: number; px: (x: number, y: number) => [number, number, number, number] } {
  const b = Buffer.from(bytes);
  if (b.subarray(1, 4).toString() !== "PNG") throw new Error("not a PNG");
  let o = 8, w = 0, h = 0, depth = 0, type = 0; const idat: Buffer[] = [];
  while (o < b.length) {
    const len = b.readUInt32BE(o), tag = b.subarray(o + 4, o + 8).toString(), d = b.subarray(o + 8, o + 8 + len);
    if (tag === "IHDR") { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]!; type = d[9]!; if (d[12] !== 0) throw new Error("interlaced"); }
    if (tag === "IDAT") idat.push(d);
    o += 12 + len;
  }
  if (depth !== 8 || (type !== 2 && type !== 6)) throw new Error("only 8-bit RGB/RGBA");
  const bpp = type === 6 ? 4 : 3, raw = inflateSync(Buffer.concat(idat)), stride = w * bpp, out = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]!, row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[y * stride + i - bpp]! : 0, up = y ? out[(y - 1) * stride + i]! : 0, c = i >= bpp && y ? out[(y - 1) * stride + i - bpp]! : 0;
      let v = row[i]!;
      if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) { const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; }
      out[y * stride + i] = v & 255;
    }
  }
  return { w, h, px: (x, y) => { const i = y * stride + x * bpp; return [out[i]!, out[i + 1]!, out[i + 2]!, type === 6 ? out[i + 3]! : 255]; } };
}
/** True when the colour is solid and within `tol` of the badge red #E23E57. */
export const isBadgeRed = ([r, g, b, a]: number[], tol = 14) => a === 255 && Math.abs(r! - 0xE2) <= tol && Math.abs(g! - 0x3E) <= tol && Math.abs(b! - 0x57) <= tol;
