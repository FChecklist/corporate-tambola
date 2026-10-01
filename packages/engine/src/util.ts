/** Last four digits of a number, everything else hidden: ••••4556. Used only where the organizer opted in to showing winners' details. */
export const maskTail = (e164: string): string => {
  const d = String(e164 ?? "").replace(/\D/g, "");
  return d.length >= 4 ? "••••" + d.slice(-4) : "";
};
