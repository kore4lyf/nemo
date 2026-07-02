# Rules for Delegation

## Overview

This project uses three files to delegate work to developers and reviewers:

| File | Purpose | Audience |
|------|---------|----------|
| `TASK.md` | What to build | Developer |
| `REVIEW.md` | What to check | Reviewer |
| `TEST.md` | How to test | Tester / Developer |

## Rules

### For the Developer

1. Read `TASK.md` first — it contains everything you need to build
2. Follow the file structure exactly as specified
3. Implement all 10 tools — do not skip any
4. Use zod schemas for every tool parameter
5. Handle errors gracefully — never let the bot crash
6. Write clean, readable code — no shortcuts

### For the Reviewer

1. Read `REVIEW.md` first — it tells you what to check
2. Reference `TASK.md` for implementation details
3. Check every item in the checklist — do not skip
4. Ask the 5 questions listed in REVIEW.md
5. Do not approve until all checklist items pass

### For the Tester

1. Read `TEST.md` first — it tells you how to test
2. Run tests in order (1-2 first, then 3-12, then 13-15)
3. Use the bug report format if anything fails
4. Do not skip error handling tests (13-14)
5. Do not skip the end-to-end test (15)

## Workflow

```
1. Developer reads TASK.md
2. Developer builds the code
3. Developer runs TEST.md (self-test)
4. Developer submits for review
5. Reviewer reads REVIEW.md
6. Reviewer checks the code
7. Reviewer asks questions from REVIEW.md
8. Reviewer approves or requests changes
9. If changes needed → go to step 2
10. If approved → done
```

## File Locations

All files are in the same directory as this file:

```
nemo/
├── RULES.md      ← This file
├── TASK.md       ← Developer reads this
├── REVIEW.md     ← Reviewer reads this
├── TEST.md       ← Tester reads this
└── src/
    └── discord/
        ├── tools.js
        ├── context.js
        └── permissions.js
```

## Important

- `TASK.md`, `REVIEW.md`, and `TEST.md` are in `.gitignore` — they are not committed to the repo
- `RULES.md` is committed — it explains the process
- All three files reference each other — read them together
