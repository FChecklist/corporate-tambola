-- Game alerts (1.13.0, push.ts): the flag that keeps the "game begins" alert to ONCE per game, because the notification service has no one-send-per-game guard of its own.
-- null = no alert yet; a time (ms) = the alert was sent at that time; -1 = no alert will be sent (the game began too long ago, or the service never answered in time).
-- ADDITIVE ONLY. Apply BEFORE deploying the code that reads it; the old code ignores the column. test/migrations.test.ts keeps this identical to PUSH_SCHEMA.
ALTER TABLE engagement ADD COLUMN push_sent_ms INTEGER;
