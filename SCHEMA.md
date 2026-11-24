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
| `settings.alwaysOnTop` | boolean | no | Ignored since v0.4. The widget keeps window settings in `prefs.json` on each computer and changes them from the tray menu. Kept here so older files stay valid. |
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

## GitHub mode

For cloud projects, where Claude cannot write to the user's disk, the file can live in a GitHub repository and be updated with commits. The widget pulls it every few minutes when `%USERPROFILE%\.milestone-stone\config.json` says so (see `config.example.json`):

```json
{ "source": "github", "github": { "repo": "owner/name", "path": "milestones.json", "branch": "main", "intervalMinutes": 5, "token": "" } }
```

- `path`, `branch` and `intervalMinutes` are optional (defaults shown; at least 1 minute). `token` is only needed for a private repo; a fine-grained token with read-only "Contents" access to that one repo is enough. It can also come from the `MILESTONE_STONE_GITHUB_TOKEN` environment variable.
- The repository brings the plan (milestones, items, texts, statuses). The local `milestones.json` is updated only when the remote file changes (and once at startup), so the rules above (schema, `.bak`, refresh) still apply.
- The widget uses the GitHub contents API with ETag; an unchanged file costs a `304` and no download.
- Content that does not match the schema is not applied.
- On a network or HTTP error the stone keeps the last valid state; the next try is pushed back (doubling, at most 30 minutes). After the computer wakes from sleep it pulls right away.
- Ticks are never lost: an item that is `done` locally stays `done` when a new remote file arrives (matched by milestone id and item text). Ticks committed to the repository arrive too. Unticking locally an item that is ticked in the repository does not last.
- Clicks on the stone are saved locally only; the widget never writes to GitHub.