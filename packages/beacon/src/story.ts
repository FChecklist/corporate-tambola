// ONE plain story for everybody: what is happening now, and what the person should do, in the SAME words on every screen (the player's phone, the big screen, the Organizer's and the Host's console,
// the Co-host's page). Every screen works out the state of the game from what it knows and asks here for the words, so the sentences cannot drift apart. Plain words only: no "round", "idx", "beacon".
// docs/GAMEDAY_STORY.md lists the whole table (state x role -> sentence).

export type StoryState =
  | "draft" | "unpaid" | "waiting" | "countdown" | "waitStart" | "running" | "paused"
  | "endedPrizes" | "endedAll" | "endedByOrganizer" | "neverStarted" | "cancelled";
export type StoryRole = "organizer" | "host" | "cohost" | "player" | "screen";

export const STORY_STATES: readonly StoryState[] = ["draft", "unpaid", "waiting", "countdown", "waitStart", "running", "paused", "endedPrizes", "endedAll", "endedByOrganizer", "neverStarted", "cancelled"];
export const STORY_ROLES: readonly StoryRole[] = ["organizer", "host", "cohost", "player", "screen"];

export interface StoryIn {
  state: StoryState; role: StoryRole;
  /** "Sat 6:30 pm": when the game starts (waiting) */
  time?: string;
  /** "2:30": how long until the first number (countdown) */
  countdown?: string;
  /** how many numbers have been called */
  called?: number;
  /** "the Organizer" / "a Host": who paused */
  by?: string;
  /** the game starts only when somebody presses Start */
  manual?: boolean;
}

/** What is happening now: the same sentence for everyone. */
export function storySay(i: Pick<StoryIn, "state" | "time" | "countdown" | "called" | "by">): string {
  switch (i.state) {
    case "draft": return "This game is not published yet.";
    case "unpaid": return "The game is waiting for payment.";
    case "waiting": return i.time ? `The game starts at ${i.time}.` : "The game has not started yet.";
    case "countdown": return i.countdown ? `The game is starting in ${i.countdown}.` : "The game is starting.";
    case "waitStart": return "Waiting for the host to begin the game.";
    case "running": return i.called === undefined ? "The game is on." : `The game is on. ${i.called} of 90 numbers called.`;
    case "paused": return `The game is paused by ${i.by || "the Organizer"}.`;
    case "endedPrizes": return `The game is over. All prizes were awarded after ${i.called ?? 0} numbers.`;
    case "endedAll": return "The game is over. All 90 numbers were called.";
    case "endedByOrganizer": return `The game was ended by the organizer after ${i.called ?? 0} numbers.`;
    case "neverStarted": return "The game was never started.";
    case "cancelled": return "This game was cancelled by the organizer.";
  }
}

/** What this person should do now. */
export function storyTodo(i: Pick<StoryIn, "state" | "role" | "manual">): string {
  const run = i.role === "organizer" || i.role === "host";
  const ended = i.state === "endedPrizes" || i.state === "endedAll" || i.state === "endedByOrganizer";
  switch (i.state) {
    case "draft": return run ? "Finish the steps and press Publish." : i.role === "cohost" ? "Wait for the Organizer to publish." : "This game is not open yet.";
    case "unpaid": return run ? "Pay in step 8 so the game can start." : i.role === "cohost" ? "Anyone can pay for the game: see the Payment step." : "Please wait. The organizer has not started the game yet.";
    case "waiting": return run ? (i.manual ? "Share the link and keep this page open. At that time, press Start." : "Nothing to do yet. Share the link and keep this page open.") : i.role === "cohost" ? "Invite your people and keep your link ready." : i.role === "screen" ? "Players: open the link below on your phone to get your ticket." : i.manual ? "Keep this page open. The host will press Start." : "Keep this page open. The numbers start by themselves.";
    case "countdown": return run ? "Get ready. The first number is coming." : i.role === "cohost" ? "The game is about to begin." : "Get ready. Keep your screen on.";
    case "waitStart": return run ? "Press Start, or change the start time." : i.role === "cohost" ? "The Organizer or a Host will press Start." : "Keep this page open. The game begins the moment the host presses Start.";
    case "running": return run ? "Watch the board. Pause only if you really must." : i.role === "cohost" ? "The Organizer and the Hosts run the game. You can follow it on the Number board." : i.role === "screen" ? "Watch the numbers. Players tap them on their tickets." : "Tap each number on your ticket. Press Claim when a prize is complete.";
    case "paused": return run ? "Press Resume when you are ready." : i.role === "cohost" ? "The game will go on when the Organizer or a Host resumes it." : "Please wait. The numbers start again when the game is resumed.";
    case "neverStarted": return run ? "Make a new game like this one." : "Thank you for coming.";
    case "cancelled": return run || i.role === "cohost" ? "Nothing more to do." : "Thank you for coming.";
    default: return ended ? (run ? "Download the game log and hand over the prizes." : i.role === "cohost" ? "Thank you for helping." : "Thank you for playing.") : "";
  }
}

export const story = (i: StoryIn): { state: StoryState; say: string; todo: string } => ({ state: i.state, say: storySay(i), todo: storyTodo(i) });

/** "Sat 6:30 pm" in India time: the same on every screen. */
export const dayTimeIst = (ms: number): string => new Date(ms).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", hour: "numeric", minute: "2-digit", hour12: true }).replace(",", "").replace(/ (am|pm)$/i, (m) => m.toLowerCase());
/** "3:05": minutes and seconds. */
export const mmss = (sec: number): string => { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0"); };
