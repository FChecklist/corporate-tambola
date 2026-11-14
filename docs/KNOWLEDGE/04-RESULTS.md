# Results

Every test file was run on its own, one at a time.

| Version | Files | Tests passing | Failing |
|---|---|---|---|
| Live (c6897f2) | 248 | 4,027 | 1 (`ai-enablement`, "third route ... Trust page and llms.txt": already failing before V2) |
| V2 (`tambola-v2`) | 264 | 4,207 | the same 1 |

V2 adds 16 files and 180 passing tests and no new failure. The full run also caught one slip that the audits had not: the word "erase" in an AI manual line (customer text must not say it). It was reworded and the file passes.

Audit: rounds 8 and 9 passed in a row; round 9 was on commit 9153cc2, after which only documents and that one word changed.
