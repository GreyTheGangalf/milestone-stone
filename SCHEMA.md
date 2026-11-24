# milestones.json schema (version 1)

`milestones.json` is the single source of truth shared by the widget and the skill. Machine-readable version: [`milestones.schema.json`](milestones.schema.json). The `milestones.json` in the repo is an example that matches this schema and is the first-run template.

At runtime the file lives at `%USERPROFILE%\.milestone-stone\milestones.json` (`~/.milestone-stone/milestones.json` on macOS/Linux).

## Root fields

| Field | Type | Required | Description |
|---|---|---|---|
| `schemaVersion` | `1` | no (defaults to 1) | Schema version. Bumped on breaking changes. |
| `project` | string | no | Project name. |
| `updatedAt` | ISO date or `null` | no | When the file was last written (UTC). |
| `updatedBy` | `"widget"`, `"skill"`, `"manual"` or `null` | no | Who wrote it last. |
| `settings.alwaysOnTop` | boolean | no (default `true`) | When `false`, the stone stays behind other windows. |
| `settings.staleDays` | integer | no (default 5) | Days without progress before the ring starts to pulse. |
| `current` | integer | no (default 0) | Index of the milestone on the front of the stone. `milestones.length` when all are sealed. |
| `milestones` | array | **yes** | At least one milestone. |

## Milestone

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `"M0"`, `"M1"`, ... | **yes** | Its number is shown in the middle of the stone. |
| `title` | string | **yes** | |
| `status` | `pending` / `active` / `paused` / `done` | **yes** | Not started / active / paused / sealed. |
| `items` | array | **yes** | Definition of done. Each item is `{ "text": string, "done": boolean }`. |
| `items[].touched` | boolean | no | Set by the widget when + or − is pressed. Visual only. |
| `startedAt` | ISO date or `null` | no | Set when the milestone becomes active (the widget adds it if missing). |
| `lastProgress` | ISO date or `null` | no | Last item change. |
| `doneAt` | ISO date or `null` | no | When it was sealed. |
| `retro` | string | no | Retrospective note. |

## Rules

- **At most one** milestone is `active` or `paused` at a time, and `current` points to it.
- A sealed milestone has `status: "done"`, `doneAt` set and `retro` written. The first `pending` milestone after it becomes `active`, gets `startedAt`, and `current` points to it. If none is left, `current = milestones.length`.
- Dates are ISO 8601, UTC (`2026-11-24T11:41:43.000Z`).
- Unknown fields are never removed; a writer keeps every field it read. This keeps future fields (e.g. GitHub sync) from being lost by older versions.
- The file is saved as UTF-8. The widget ignores a leading BOM.

## Write rules (widget and skill)

1. **Read, then write.** Re-read the file right before writing and apply the change on top of it.
2. **Write atomically.** Write a temp file in the same folder (`milestones.json.<pid>.tmp`), then rename it to `milestones.json`. A reader never sees a half-written file.
3. Update `updatedAt` and `updatedBy`.

## Widget robustness

- If the file is corrupt or half-written, the widget does not crash; it keeps showing the last valid state and loads the file once it is fixed.
- If the file is corrupt at startup, it is moved aside as `milestones.json.corrupt-<time>` and the widget continues from `milestones.json.bak` (or from the repo template if there is no backup).
- The widget does not treat its own writes as external changes; it decides by content, not by timing.
- If the skill changed the file and the widget has not loaded it yet, the widget does not overwrite it with stale state; it refreshes the stone first. That one click may be lost, the skill's change is not.

## Later: pulling from GitHub

For cloud projects the widget may read the file from a GitHub repository. The schema is ready for that: the content is valid wherever the file lives, `updatedAt`/`updatedBy` tell which copy is newer, and since unknown fields are kept, sync metadata can be added. Not implemented in this version.