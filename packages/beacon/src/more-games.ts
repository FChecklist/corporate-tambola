// "More games from Corporate Tambola": the list every customer report, e-mail and download ends with. ONE place: when the games move to their own subdomains, change `url` here (or HOME) and nothing else.
export const HOME = "https://home.corporatetambola.com";
export interface MoreGame { id: string; name: string; line: string; url: string }
export const MORE_GAMES: readonly MoreGame[] = [
  { id: "housie", name: "Housie / Tambola", line: "The classic: numbers are called live, you tick your ticket and claim your prize.", url: HOME + "/#housie" },
  { id: "bingo", name: "Bingo", line: "Five-in-a-row on your card, called live for the whole team.", url: HOME + "/#bingo" },
  { id: "tictactoe", name: "Tic-Tac-Toe", line: "A quick head-to-head round for two, played together on a call.", url: HOME + "/#tictactoe" },
  { id: "snakesladders", name: "Snakes & Ladders", line: "A friendly race to 100 where luck can change everything.", url: HOME + "/#snakesladders" },
  { id: "luckbychance", name: "Luck by Chance", line: "Pick your chance and see what the draw brings.", url: HOME + "/#luckbychance" },
  { id: "luckydraw", name: "Lucky Draw", line: "A fair, public draw for gifts and prizes.", url: HOME + "/#luckydraw" },
];
export const moreGamesText = (): string => MORE_GAMES.map((g) => `- ${g.name}: ${g.line} ${g.url}`).join(String.fromCharCode(10));
