// "More games from Corporate Tambola": the list every customer report, e-mail and download ends with. ONE place: when the games move to their own subdomains, change `url` here (or HOME) and nothing else.
export const HOME = "https://games.corporatetambola.com"; // the hub of all games (the same list the slim games bar at the top of every page uses: apps/web/public/gamesbar.js)
export interface MoreGame { id: string; name: string; line: string; url: string }
export const MORE_GAMES: readonly MoreGame[] = [
  { id: "housie", name: "Housie / Tambola", line: "The classic: numbers are called live, you tick your ticket and claim your prize.", url: "https://corporatetambola.com/" },
  { id: "bingo", name: "Bingo", line: "Five-in-a-row on your card, called live for the whole team.", url: "https://bingo.corporatetambola.com/" },
  { id: "tictactoe", name: "Tic-Tac-Toe", line: "A quick head-to-head round for two, played together on a call.", url: "https://tictactoe.corporatetambola.com/" },
  { id: "snakesladders", name: "Snakes & Ladders", line: "A friendly race to 100 where luck can change everything.", url: "https://snakes.corporatetambola.com/" },
  { id: "luckbychance", name: "Luck by Chance", line: "Pick your chance and see what the draw brings.", url: "https://luck.corporatetambola.com/" },
  { id: "luckydraw", name: "Lucky Draw", line: "A fair, public draw for gifts and prizes.", url: "https://games.corporatetambola.com/" },
];
export const moreGamesText = (): string => MORE_GAMES.map((g) => `- ${g.name}: ${g.line} ${g.url}`).join(String.fromCharCode(10));
