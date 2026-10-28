// Bundled to apps/web/public/zgame.js (window.ZG): everything the phone page and the organizer page need from the shared logic.
import { PATTERNS } from "../../shared/src/ticket";
import { ALL_PATTERNS, activeBreak, activeIntermission, callRoundFull, callRoundR, hostGameOf, unshiftedRound, luckyRound, luckyWinners, checkClaims, completionIndex, completionIndexKey, logFrom, RoundStore, scheduleFull, settleAll, stillToWin, ticketFor, ticketsFor } from "./game";
import { INVITE_CATEGORIES, GRACE_ROUNDS, LATE_LAG_ROUNDS, INTERMISSION_ROUNDS, MAX_ROUNDS, roundEid, MAX_BREAKS, PATTERN_ORDER, PRIZE_HOUSES, HOUSE_ORDER, HOUSES_LINE, maxWinnersFor, houseLabel, LEGACY_MAX_ORDINAL, breakShift, defaultCfg, keysInPlay, linesFor, validateCfg, PLAYER_TIP, CLAIM_RULE_TEXT, CLAIM_WINDOW_CALLS } from "./config";
import { BOGEYS_OUT } from "./game";
import { PhoneRuntime } from "./phone-runtime";
import { PrizeEngine, countFromOf } from "./prize-engine";
import { QUICKNET, deriveCalls, fetchRound, roundAt, roundTimeMs, scheduleFor } from "./index";
import { callRound, resolveControl, cfgOf, scheduleWithControl, hostCallRound, NEXT_LEAD_ROUNDS, NEXT_REFUSALS, PAUSE_MAX_PARTICIPANTS } from "./control";
import * as DEMO from "./demo-script";
import { prizeStatus } from "./prize-status";
import { story, dayTimeIst, mmss } from "./story";
import { averageGapSeconds, gapsByMode, calledLine, sequenceCheck } from "./gaps";

(globalThis as any).ZG = { DEMO, prizeStatus, story, dayTimeIst, mmss, averageGapSeconds, gapsByMode, calledLine, sequenceCheck, PLAYER_TIP, CLAIM_RULE_TEXT, CLAIM_WINDOW_CALLS, BOGEYS_OUT, PRIZE_HOUSES, HOUSE_ORDER, HOUSES_LINE, maxWinnersFor, houseLabel, LEGACY_MAX_ORDINAL, INVITE_CATEGORIES, PrizeEngine, countFromOf, GRACE_ROUNDS, LATE_LAG_ROUNDS, activeIntermission, callRoundR, unshiftedRound, INTERMISSION_ROUNDS, MAX_ROUNDS, roundEid, luckyRound, luckyWinners, ticketsFor, completionIndexKey, activeBreak, callRoundFull, scheduleFull, MAX_BREAKS, PATTERN_ORDER, breakShift, defaultCfg, keysInPlay, linesFor, validateCfg, PATTERNS, ALL_PATTERNS, checkClaims, completionIndex, logFrom, RoundStore, settleAll, stillToWin, ticketFor, PhoneRuntime, QUICKNET, deriveCalls, fetchRound, roundAt, roundTimeMs, scheduleFor, callRound, resolveControl, cfgOf, scheduleWithControl, hostGameOf, hostCallRound, NEXT_LEAD_ROUNDS, NEXT_REFUSALS, PAUSE_MAX_PARTICIPANTS };
import { MSG, MSG_VERSION, say } from "./messages";
import * as BEAT from "./beat";
Object.assign((globalThis as any).ZG, { MSG, MSG_VERSION, say, BEAT });
import { MORE_GAMES, moreGamesText } from "./more-games";
Object.assign((globalThis as any).ZG, { MORE_GAMES, moreGamesText });
