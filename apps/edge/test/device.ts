// Phones send a device id when they join (one ticket, one device). Older tests do not care which device: they all join from the same one unless they say otherwise.
export const DEVICE = "a".repeat(32);
export const withDevice = (method: string, path: string, body: unknown) => {
  const b = method === "POST" && /\/join$/.test(path) && body && typeof body === "object" && !("device" in (body as object)) ? { device: DEVICE, ...(body as object) } : body;
  return b === undefined ? undefined : typeof b === "string" ? b : JSON.stringify(b);
};
