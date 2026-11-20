# Versioning to do (Corporate Tambola)

Not done in the docs-only pass (no app code was changed). The game's own session does these inside its PR:
1. Add `version.json` (source file, schema in the standard section 2.1: product, version, commit, builtAt, changes[last 20]: id, what, where, pr). Today `pages/version.mjs` writes only commit, dirty, builtAt, game; extend it to also copy version and changes.
2. Pick the first version number and write it: live is already 1.9.0; next is 1.9.1 for a fix or 1.10.0 for a feature; the ID-invite change is a rule change = 2.0.0.
3. Show `vX.Y.Z` in the site footer and link it to `/changes`.
4. Add the `/changes` page (plain-English "What's new", last 10 changes, user words only, NO security details, NO internal ids), reading from `/version.json`. Keep the X-Robots-Tag noai protection headers. Do not publish docs/KNOWLEDGE.md.
5. From now on every deploy bumps the version and adds a CHANGELOG.md entry with two audit PASS ids and the previous deploy's rollback id.
6. Fill the previous-deploy rollback id for the live deploy (unknown today).
