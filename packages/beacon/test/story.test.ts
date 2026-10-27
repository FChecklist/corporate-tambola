// One plain story for everybody: every state has one sentence for "what is happening" (the same for every role) and one for "what to do" (per role), in plain words.
import { describe, expect, test } from "bun:test";
import { STORY_ROLES, STORY_STATES, dayTimeIst, mmss, story, storySay, storyTodo } from "../src/story";

const BANNED = /\b(idx|round|rounds|beacon|json|http|undefined|null|NaN|seat|pid|signature|control file|hold|blind)\b/i;
describe("the story table", () => {
  test("every state x role has a plain 'what to do', every state has one 'what is happening', the same words for every role", () => {
    for (const state of STORY_STATES) {
      const say = storySay({ state, time: "Sat 6:30 pm", countdown: "2:05", called: 30, by: "the Organizer" });
      expect(say.length).toBeGreaterThan(10); expect(say).not.toMatch(BANNED);
      for (const role of STORY_ROLES) {
        const s = story({ state, role, time: "Sat 6:30 pm", countdown: "2:05", called: 30, by: "the Organizer" });
        expect(s.say).toBe(say); expect([state, role, s.todo.length > 8]).toEqual([state, role, true]); expect(s.todo).not.toMatch(BANNED);
      }
    }
  });
  test("the sentences carry the facts: the time, the countdown, the count of numbers, who paused", () => {
    expect(storySay({ state: "waiting", time: "Sat 6:30 pm" })).toBe("The game starts at Sat 6:30 pm.");
    expect(storySay({ state: "countdown", countdown: "2:05" })).toBe("The game is starting in 2:05.");
    expect(storySay({ state: "running", called: 30 })).toBe("The game is on. 30 of 90 numbers called.");
    expect(storySay({ state: "running" })).toBe("The game is on.");
    expect(storySay({ state: "paused", by: "a Host" })).toBe("The game is paused by a Host.");
    expect(storySay({ state: "endedPrizes", called: 41 })).toBe("The game is over. All prizes were awarded after 41 numbers.");
    expect(storySay({ state: "endedAll" })).toBe("The game is over. All 90 numbers were called.");
    expect(storySay({ state: "waitStart" })).toBe("Waiting for the host to begin the game.");
  });
  test("the organizer and the host are told exactly what to do in the hard moments; players are told something different and gentle", () => {
    expect(storyTodo({ state: "waitStart", role: "organizer" })).toBe("Press Start, or change the start time.");
    expect(storyTodo({ state: "waitStart", role: "host" })).toBe("Press Start, or change the start time.");
    expect(storyTodo({ state: "waitStart", role: "player" })).toMatch(/Keep this page open/);
    expect(storyTodo({ state: "paused", role: "organizer" })).toBe("Press Resume when you are ready.");
    expect(storyTodo({ state: "paused", role: "player" })).toMatch(/Please wait/);
    expect(storyTodo({ state: "unpaid", role: "organizer" })).toMatch(/Pay in step 8/);
    expect(storyTodo({ state: "endedAll", role: "organizer" })).toMatch(/Download the game log/);
    expect(storyTodo({ state: "waiting", role: "organizer", manual: true })).toMatch(/press Start/);
  });
  test("the time and the countdown are written the same way everywhere", () => {
    expect(dayTimeIst(Date.UTC(2026, 9, 27, 13, 0))).toMatch(/^Tue 6:30 pm$/);
    expect(mmss(125)).toBe("2:05"); expect(mmss(59)).toBe("0:59");
  });
});
