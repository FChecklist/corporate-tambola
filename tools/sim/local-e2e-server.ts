// Starts the local stand-in (Worker + SQLite + the app files) for the real-browser end-to-end run. env: PORT. Payments are off and engagements are free (FREE_LAUNCH).
import { startLocal } from "../../apps/edge/src/local";
const s = startLocal({ port: Number(process.env.PORT ?? 8791), secret: "e2e", dbFile: ":memory:" });
(s.env as any).FREE_LAUNCH = "1";
(s.env as any).ORGANIZER_SECRET = "e2e";
console.log("READY " + s.url);
