---
name: milestone-stone
description: Reads and updates the milestones.json file of the Milestone Stone desktop widget, on the local disk or in a GitHub repository (cloud mode, updated by commit). Use when the user says things like "M3 is done" / "M3 bitti", marks a checklist item as done, pauses or resumes a milestone, asks where their milestones stand, or wants a milestone plan extracted from PROJE.md or the conversation and loaded onto the stone.
---

# Milestone Stone

A small stone sits on the user's desktop and shows the active milestone. Its single source of truth is a JSON file. This skill reads that file and writes it following the rules below. The widget notices the change within about a second and refreshes the stone by itself.

- File: `%USERPROFILE%\.milestone-stone\milestones.json` (macOS/Linux: `~/.milestone-stone/milestones.json`). To be sure: `node <skill dir>/scripts/stone.js path`
- If you cannot reach the user's disk (claude.ai cloud project, Claude Code on the web), the file lives in a GitHub repository instead: see **Cloud mode** below.
- Schema: summary below. Full version in the repo's `SCHEMA.md` and `milestones.schema.json`.
- Talk to the user in their language (Turkish for this user). Keep the JSON's own text (titles, items, retro) in the language the user writes them in.

## Steps for every operation

1. Run `node scripts/stone.js show` to read and check the current state. If you are going to change it, get the full content with `node scripts/stone.js cat`. Do not trust an older copy from earlier in the conversation; the widget may have written in the meantime.
2. Apply the change on top of that fresh content. **Never drop fields you don't know**, and keep the order.
3. Write the new content to a temp file (e.g. `milestones.new.json` in the OS temp dir) and run `node scripts/stone.js apply <that file>`. The script validates, sets `updatedAt` / `updatedBy: "skill"` and writes atomically (temp file + rename). If validation fails, fix the content; never write the file another way.
4. Tell the user in one or two sentences what changed.

Without Node: follow the same rules by hand and replace `milestones.json` by writing a temp file in the same folder and renaming it. With neither disk nor GitHub access, give the full updated JSON and tell the user where the file lives.

## Cloud mode (file in a GitHub repository)

The widget can pull `milestones.json` from a GitHub repository every few minutes (default 5). Then the file in the repository is the source of truth and you update it with a commit.

1. Find the repository, path and branch: from the user, project notes or memory. They match `github.repo`, `github.path` (default `milestones.json`) and `github.branch` (default `main`) in the user's `%USERPROFILE%\.milestone-stone\config.json`.
2. Start from the latest commit: `git clone --depth 1 -b <branch> https://github.com/<repo>`, or `git pull` in an existing clone.
3. Do the operation as above, pointing the script at the file in the clone: `MILESTONE_STONE_FILE=<clone>/<path> node scripts/stone.js show | cat | apply <new.json>`.
4. Commit only that file, directly to that branch (the widget does not see other branches or open pull requests), with a short message such as `stone: seal M2` or `stone: M1 item done`, and push.
5. If the push is rejected because the branch moved, do not merge by hand: pull again and redo the change from step 3.
6. Tell the user the stone will update within the polling interval (a few minutes).

Without git, with a GitHub API or connector: read the file and its `sha`, apply the same rules, and write the full new content with that `sha`. If GitHub rejects the `sha` as stale, read again and redo the change.

In this mode the widget never writes to GitHub. Ticks the user makes on the stone stay local and are never removed by a pull: when your commit arrives, any item already done on the stone stays done. So keep item texts stable when you edit the plan (a renamed item loses its local tick), and when the user tells you an item is done, tick it in the repository too.

## Schema summary (version 1)

```json
{
  "schemaVersion": 1,
  "project": "Project name",
  "updatedAt": "2026-11-24T11:41:43.000Z", "updatedBy": "skill",
  "settings": { "alwaysOnTop": true, "staleDays": 5 },
  "current": 0,
  "milestones": [
    {
      "id": "M0", "title": "Setup", "status": "active",
      "items": [ { "text": "Repo skeleton ready", "done": false } ],
      "startedAt": "2026-11-24T09:00:00.000Z", "lastProgress": null, "doneAt": null, "retro": ""
    }
  ]
}
```

- `status`: `pending` (not started), `active`, `paused`, `done` (sealed).
- At most one milestone is `active` or `paused` at a time. `current` is its index; if all are sealed, `current = milestones.length`.
- `items[].touched` is a visual flag set by the widget; keep it if present, no need to add it.
- Dates are ISO 8601, UTC.

## Operations

### Status ("how is the stone", "what's next")
Summarise the `show` output briefly: active milestone, items done, items left, days since last progress.

### Marking an item ("question types are done in M2")
- Match the item by its text. If it is ambiguous, ask which one.
- Set `done: true` (or `false` to undo) and `touched: true`; set the milestone's `lastProgress` to now.
- If the milestone is `paused`, make it `active`.
- If this completes all items, offer to seal it (below); do not seal on your own.

### Finishing and sealing a milestone ("M3 is done")
1. If that milestone is not `active` or `paused`, tell the user its status and ask what they want.
2. If some items are not done, list them and ask: count them all as done, or are some really missing? Do not mark them without confirmation.
3. Run a **short retro**; ask at most two questions at a time:
   - What went well?
   - What was hard, or what would you do differently next time?
   Turn the answers into a one-sentence `retro` and show it to the user. If they want to skip the retro, `retro` may stay empty.
4. Seal: all items `done: true`, `status: "done"`, `doneAt` now, `retro` set, `lastProgress` now.
5. Next: make the first `pending` milestone `active`, set its `startedAt` to now and `current` to its index. If none is left, set `current = milestones.length` and congratulate the user.
6. After writing, remind the user of the next milestone's "done" definition (its items).

### Pause / resume
Toggle `status` between `paused` and `active`. Pausing is a first-class state: never make the user feel guilty about it.

### Extracting a plan (from PROJE.md or the conversation)
1. Read the source; look for ordered intermediate goals, not a timeline. For each milestone write 2–5 **verifiable** "done" items ("X works", "Y checked by hand"). No dates.
2. Ids start at `M0` and increase in order. The first one is `active` (`startedAt` now), the rest `pending`; `current: 0`.
3. Show the plan to the user as a plain list first and get approval.
4. If the existing file has progress (`done` items, sealed stones), say so clearly and get approval before overwriting. Keep the old file by copying it to `milestones.<date>.json` in the same folder first.
5. Keep `settings` and any unknown root fields from the old file.

### Editing the plan (add items, add/remove milestones, rename)
Do not touch sealed (`done`) milestones; ask first if the user wants to change one. If a milestone is removed, recompute `current`.

## Don't
- Change anything about how the stone looks (index.html) from this skill.
- Seal a milestone or change the plan without the user's approval.
- Write `milestones.json` piece by piece; always write the full content atomically.
- In cloud mode, commit anything other than the milestones file, or commit to a branch the widget does not read.