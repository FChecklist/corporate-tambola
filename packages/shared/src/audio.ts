/**
 * Spoken text for the one fixed voice (owner decision CR-03).
 *   24 -> "Next number is two four, twenty-four. Number twenty-four."
 *    7 -> "Next number is seven. Number seven."   (single digits are not repeated)
 *   10 -> "Next number is one zero, ten. Number ten."
 */
const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

export function numberWords(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 90) throw new RangeError("number must be 1..90");
  if (n < 20) return ONES[n]!;
  const t = Math.floor(n / 10), o = n % 10;
  return o === 0 ? TENS[t]! : `${TENS[t]}-${ONES[o]}`;
}

export const numberDigits = (n: number): string => String(n).split("").map((d) => ONES[Number(d)]).join(" ");

export function spokenPhrase(n: number): string {
  const w = numberWords(n);
  if (n < 10) return `Next number is ${w}. Number ${w}.`;
  return `Next number is ${numberDigits(n)}, ${w}. Number ${w}.`;
}

/** Version of the audio pack; bump when voice or wording changes so devices re-download. */
export const AUDIO_PACK_VERSION = "v1-en-in-f";
export const audioClipPath = (n: number) => `/audio/${AUDIO_PACK_VERSION}/${String(n).padStart(2, "0")}.m4a`;
