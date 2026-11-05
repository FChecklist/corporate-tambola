/* What Corporate Tambola tells the shared new organizer flow (pack/zc-flow.js) about itself. The flow holds no game rules: the prize list comes from this game's own table (ZG.PRIZE_HOUSES). */
window.ZFLOW_GAME = {
  brand: "Corporate Tambola",
  tickets: [1, 2],            // a participant can get one ticket or two
  bumper: true,               // Super Bumper House (all numbers of two tickets together)
  boardMax: 90, boardCols: 10, boardTitle: "HOUSIE", // the retro 1 to 90 board: 10 across, 9 down
  rehearsal: true, feed: true, presence: true, control: true, lucky: true, // the 1.5-1.6 features this game has: rehearsals, game log, phones listening, next-number control, lucky draw
  popular: ["early5", "top", "full"],
  recommended: ["early5", "top", "mid", "bot", "full"],
};
