// Bundled to apps/web/public/zgame.js (window.ZG): everything the phone page and the organizer page need from the shared logic.
import { PATTERNS } from "../../shared/src/ticket";
import { ALL_PATTERNS, activeBreak, activeIntermission, callRoundFull, callRoundR, unshiftedRound, luckyRound, luckyWinners, checkClaims, completionIndex, completionIndexKey, logFrom, RoundStore, scheduleFull, settleAll, stillToWin, ticketFor, ticketsFor } from "./game";
import { GRACE_ROUNDS, LATE_LAG_ROUNDS, INTERMISSION_ROUNDS, MAX_ROUNDS, roundEid, MAX_BREAKS, PATTERN_ORDER, breakShift, defaultCfg, keysInPlay, linesFor, validateCfg } from "./config";
import { PhoneRuntime } from "./phone-runtime";
import { QUICKNET, deriveCalls, fetchRound, roundAt, roundTimeMs, scheduleFor } from "./index";
import { callRound, resolveControl, cfgOf, scheduleWithControl } from "./control";

(globalThis as any).ZG = { GRACE_ROUNDS, LATE_LAG_ROUNDS, activeIntermission, callRoundR, unshiftedRound, INTERMISSION_ROUNDS, MAX_ROUNDS, roundEid, luckyRound, luckyWinners, ticketsFor, completionIndexKey, activeBreak, callRoundFull, scheduleFull, MAX_BREAKS, PATTERN_ORDER, breakShift, defaultCfg, keysInPlay, linesFor, validateCfg, PATTERNS, ALL_PATTERNS, checkClaims, completionIndex, logFrom, RoundStore, settleAll, stillToWin, ticketFor, PhoneRuntime, QUICKNET, deriveCalls, fetchRound, roundAt, roundTimeMs, scheduleFor, callRound, resolveControl, cfgOf, scheduleWithControl };
