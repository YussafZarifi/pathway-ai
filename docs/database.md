# Data & Database

## Supabase Postgres (✅ since 2026-09-30, Milestone 1, ADR-018)

Project `pczczkmkavmxibxureck` (free plan). Migrations are Supabase CLI SQL files in `supabase/migrations/` (the file name's timestamp is the version recorded in the project's migration history). They were applied through the Supabase MCP server; with the CLI: `supabase link --project-ref pczczkmkavmxibxureck` then `supabase db push`.

| Table | Columns | Access |
|---|---|---|
| `public.profiles` | `id uuid PK → auth.users(id) on delete cascade`, `display_name text` (1–60 chars or null), `created_at`, `updated_at` | RLS on. `authenticated`: select own row, update own `display_name` only. `anon`: nothing. Rows are created by the `on_auth_user_created` trigger (`private.handle_new_user`, security definer, in the non-exposed `private` schema) from the sign-up metadata `display_name` (trimmed, ≤60, display-only, never used for authorization) |

Verified on 2026-09-30 in a rolled-back transaction: the trigger creates the row, a user sees 1 row and cannot update another user's row, `anon` has no privileges, clients cannot insert. Security and performance advisors: no findings.

## Saved roadmaps (✅ since 2026-10-03, Milestone 2, ADR-019)

Signed-in users' roadmaps live in Postgres; guests keep browser storage (below). Migrations `20261004014249_create_roadmaps` and `20261004014958_create_step_progress`.

| Table | Key columns | Written by | Browser (`authenticated`) |
|---|---|---|---|
| `quiz_submissions` | `id`, `user_id`, `answers jsonb` (≤4 KB), `answers_version` 1/2, `created_at` | FastAPI (`pathwayai_api`) | **no access** (server-only answers) |
| `roadmaps` | `id`, `user_id`, `quiz_submission_id` (composite FK to the same user's submission; required unless imported), `career`, `career_data jsonb`, `prompt_version`, `source` generated/imported, `status` active/archived, `local_id` (unique per user), `created_at`, `updated_at` | FastAPI | select own |
| `roadmap_steps` | `id`, `roadmap_id` + `user_id` (composite FK, cascade), `position` 0–9 (unique per roadmap, deferrable), `title`, `description`, `time_estimate`, `tasks`/`resources`/`videos` jsonb (size-limited), `video_query`, `video_search_url` | FastAPI | select own |
| `step_progress` | PK `(step_id, user_id)` → `roadmap_steps (id, user_id)` cascade, `completed_at` default `now()` | browser (mark/unmark); FastAPI on import | select, insert (`step_id`, `user_id` only: the time is the database's), delete own |

- **One current roadmap:** partial unique index `(user_id) where status = 'active'`; generating, regenerating or importing a newer roadmap archives the previous one. Archived roadmaps stay (history; a list/switch UI can come later without schema changes).
- **RLS:** one policy per operation shared by `authenticated` and `pathwayai_api`: `user_id = (select private.request_user_id())` (same logic as `auth.uid()`; ADR-019 amendment). `anon` has no grants. `pathwayai_api` (`nobypassrls`, member of no role) can insert submissions/roadmaps/steps/progress, update only `roadmaps.status`, and delete nothing.
- **Ownership by foreign keys:** composite `(…, user_id)` keys make it impossible for a step, a progress row or a roadmap's submission to point at another user's rows, even for a buggy writer.
- **Account deletion** cascades from `auth.users` to every table.
- **How the browser reads:** one PostgREST request, `roadmaps` with embedded `roadmap_steps` and their `step_progress` (`lib/roadmaps/accountRepository.js`), newest 20.
- **Activity for signed-in users** (streak, active days, achievements) is derived from these rows: `roadmaps.created_at` (each generated roadmap = a completed quiz and a chosen career) and `step_progress.completed_at`. No events table (deferred, ADR-019).
- **Guest import:** a signed-in user can save the browser's `pathwayai_roadmap` (with its completed steps) to the account once (`POST /api/roadmaps/import`, idempotent per `local_id`); afterwards `pathwayai_roadmap` and that roadmap's `roadmap_step_<id>_*` progress keys are removed from the browser (events stay).
- **Checks:** `supabase/tests/m2_2_roadmaps_rls.sql` (31), `m2_3_step_progress_rls.sql` (22), `m2_4_api_role_connection.py` (18, through the pooler).

## Resume analyses (✅ since 2026-10-05, Milestone 3, ADR-020; written by `POST /api/resume-analyses` since M3-4, read by the browser from M3-5)

Migration `20261006030329_create_resume_analyses`. Only the structured AI review is stored — never the PDF, its text, file name or a hash of it.

| Table | Key columns | Written by | Browser (`authenticated`) |
|---|---|---|---|
| `resume_analyses` | `id`, `user_id` → `auth.users` cascade, `roadmap_id` (composite FK `(roadmap_id, user_id)` → `roadmaps`, `on delete set null (roadmap_id)`), `career` (1–100 chars), `analysis jsonb` (object, ≤ 16 KB), `prompt_version`, `model`, `created_at` | FastAPI (`pathwayai_api`: select + insert) | select own, **delete own** (history with user-controlled deletion) |

- **RLS:** the same shared per-operation policies as Milestone 2 (`user_id = (select private.request_user_id())`); no update for anyone; `anon` has no grants.
- **Ownership:** the composite key stops an analysis from pointing at another user's roadmap; deleting a roadmap keeps its analyses (only `roadmap_id` is cleared, `user_id` stays); deleting the account removes them.
- **Indexes:** `(user_id, created_at desc)` for the newest-first history, `(roadmap_id, user_id)` for the foreign key.
- **Checks:** `supabase/tests/m3_2_resume_analyses_rls.sql` (28).

## AI Coach (✅ tables since 2026-10-07, Milestone 4, ADR-021)

Migration `20261008030949_create_coach_threads_and_messages`.

| Table | Key columns | Written by | Browser (`authenticated`) |
|---|---|---|---|
| `coach_threads` | `id`, `user_id` → `auth.users` cascade, `roadmap_id` (composite FK → `roadmaps (id, user_id)`, `on delete set null (roadmap_id)`), `title` (1–80), `created_at`, `updated_at` (trigger) | FastAPI (`pathwayai_api`: select, insert, update `updated_at` only) | select own, **delete own** (whole conversation) |
| `coach_messages` | `id`, `thread_id` + `user_id` (composite FK → `coach_threads (id, user_id)`, cascade), `role` user/assistant, `content` (1–4,000), `actions` jsonb array ≤ 2 KB (empty for user messages), `created_at` | FastAPI (select, insert) | select own |

- **RLS:** shared per-operation policies on `private.request_user_id()`; nobody edits message content or titles; `anon` has no grants.
- **Ownership:** composite keys stop a message from joining another user's thread and a thread from pointing at another user's roadmap; deleting a roadmap keeps its threads; deleting a thread removes its messages; deleting the account removes everything.
- **Checks:** `supabase/tests/m4_1_coach_rls.sql` (37).

## Step notes and target dates (✅ since 2026-10-07)

Migration `20261008035233_create_step_notes`: `step_notes (step_id + user_id → roadmap_steps (id, user_id) cascade, note ≤ 2,000 chars, target_date 2020–2100, updated_at by trigger)`, primary key `(step_id, user_id)`; a row exists only while it has a note or a date. User-owned state like `step_progress` (ADR-019): the browser selects, inserts (`step_id, user_id, note, target_date`), updates (`note, target_date` only) and deletes its own rows through RLS; `pathwayai_api` may only read (data export, coach context with target dates); `anon` nothing. Guests keep the same data in localStorage (`pathwayai_step_notes`, current roadmap only). Checks: `supabase/tests/v1_step_notes_rls.sql` (18).

## Account deletion (✅ since 2026-10-07, ADR-022)

Migration `20261008033106_create_delete_current_user`: `private.delete_current_user()` — `security definer`, `search_path = ''`, executable only by `pathwayai_api` (revoked from `public`, `anon`, `authenticated`), deletes the `auth.users` row of `private.request_user_id()` (the claims FastAPI sets from a verified token) and returns whether a row was deleted. Every PathwayAI table cascades from `auth.users`. Checks: `supabase/tests/v1_delete_current_user.sql` (8: browser and anon can't call it; no claims → nothing deleted; deletes exactly the claimed user and all their rows; others untouched; second call is a no-op; the API role still can't read `auth.users`).

Migration `20261009033403_create_session_is_active` (ADR-022 amendment): `private.session_is_active(p_session_id uuid)` — `security definer`, `search_path = ''`, true only while that `auth.sessions` row belongs to the user in the request claims and hasn't passed `not_after`; executable only by `pathwayai_api`. FastAPI calls it before guarded routes (`session_check.py`). Checks: `supabase/tests/v1_session_is_active.sql` (7).

## Browser storage (✅): the guest flow

For guests (and builds without accounts) all roadmap persistence is **client-side**, in two `localStorage` keys: `pathwayai_roadmap` (the current roadmap, since 2026-09-26, ADR-013) and `pathwayai_tracking` (events, metrics, progress).

### `pathwayai_roadmap` (`lib/roadmapStore.js`)
```jsonc
{
  "version": 1,
  "id": "m1abcxyz12",            // new id per generated roadmap; scopes the progress keys
  "career": "Data Analyst",
  "careerData": { /* the chosen career card: match_score, salary_range, skills… */ },
  "answers": { /* the quiz answers (v2, or v1 for older roadmaps), used by Regenerate */ },
  "roadmap": [ { "title": "…", "time": "…", "tasks": [], "resources": [], "videos": [], "video_search_url": "…" } ],
  "generatedAt": 1727…
}
```
One roadmap at a time: generating a new one replaces it. A record with another version, no id or an empty roadmap is treated as "no roadmap" (the dashboard shows its empty state).

### `pathwayai_tracking` (`lib/trackingEngine.js`)

```jsonc
{
  "version": "1.0.0",
  "events":   [ { "id": "1727…_ab12cd34", "type": "quiz_completed", "payload": { … }, "timestamp": 1727… } ],
  "metrics":  { "resume_score": { "values": [{ "value": 72, "timestamp": … }], "current": 72, "average": 72, "max": 72, "min": 72, "lastUpdated": … } },
  "progress": { "roadmap_step_<roadmapId>_0": { "started": null, "completed": 1727…, "skipped": false, "attempts": 0, "lastStatus": "completed", "lastUpdated": …, "metadata": {} } },
  "sessionStartTime": …, "lastSessionStart": …, "totalSessions": 3,
  "totalScreensViewed": 41,   // ⚠ incremented on every event, not screens
  "actionsCompleted": 41
}
```

- Event types and metric names: `frontend/src/data/trackingSchema.js` (the string values are a persistence contract).
- `validateEvent` checks required payload fields only.
- The `resume_score` metric in the example above is only written by the deleted simulated analyzer; no shipped code writes it now.
- **Not stored:** the 3 career suggestions (they live in React Router `location.state` on `/results` only).

### Problems
- ~~Progress keys aren't scoped to a roadmap~~ — fixed 2026-09-26: keys are `roadmap_step_<roadmapId>_<index>` (ADR-013). Old unscoped keys are ignored, not migrated.
- One roadmap per browser; a new roadmap replaces the previous one (B-20 would keep several).
- `events[]` grows forever. `getTrackingData()` parses and **re-writes** the whole blob on every read.
- `quiz_completed` and per-question events store raw answers in the browser, and `pathwayai_roadmap` stores the answers, including the optional "career in mind" text (TD-41).
- No sync across devices; clearing site data wipes everything.
- The ~5 MB localStorage quota will eventually be reached, and failures are only logged to the console.

## Short-term plan (🗺️, B-18/B-20)
The current roadmap is persisted (above). Still planned before accounts: several saved roadmaps and a capped event log, for example:
```jsonc
{
  "version": "2.0.0",
  "roadmaps": { "<roadmapId>": { "career": "…", "createdAt": …, "steps": [ … ] } },
  "activeRoadmapId": "<roadmapId>",
  "progress": { "<roadmapId>": { "<stepIndex>": { "status": "completed", "updatedAt": … } } },
  "events": [ /* capped, e.g. last 500 */ ]
}
```
Include a migration from v1 (drop or ignore old unscoped `roadmap_step_*` keys).

## Target schema (🗺️) — PostgreSQL

> Partly superseded by Milestone 2 (above): `quiz_sessions` became `quiz_submissions`, progress is `step_progress` (one row per completed step) instead of `progress_events`, and career suggestions are not stored. The rest (resources, resumes, coach messages, sharing) is still a sketch for later milestones.

```mermaid
erDiagram
    users ||--o{ quiz_sessions : takes
    users ||--o{ roadmaps : owns
    quiz_sessions ||--o{ career_suggestions : produces
    roadmaps ||--o{ roadmap_steps : contains
    roadmap_steps ||--o{ step_resources : lists
    roadmap_steps ||--o{ progress_events : tracks
    users ||--o{ resumes : uploads
    users ||--o{ coach_messages : sends
    resources ||--o{ step_resources : referenced_by

    users {
        uuid id PK
        text email UK
        text display_name
        text locale
        timestamptz created_at
    }
    quiz_sessions {
        uuid id PK
        uuid user_id FK
        jsonb answers
        text prompt_version
        timestamptz created_at
    }
    career_suggestions {
        uuid id PK
        uuid quiz_session_id FK
        text title
        int match_score
        text reason
        jsonb meta
    }
    roadmaps {
        uuid id PK
        uuid user_id FK
        text career
        text share_slug UK
        bool is_public
        text prompt_version
        timestamptz created_at
    }
    roadmap_steps {
        uuid id PK
        uuid roadmap_id FK
        int position
        text title
        text description
        text time_estimate
        jsonb tasks
        text status
        timestamptz completed_at
    }
    resources {
        uuid id PK
        text title
        text url UK
        text type
        text_array skills
        text level
        bool link_ok
        timestamptz checked_at
        vector embedding
    }
    step_resources {
        uuid step_id FK
        uuid resource_id FK
    }
    progress_events {
        bigserial id PK
        uuid step_id FK
        text status
        timestamptz at
    }
    resumes {
        uuid id PK
        uuid user_id FK
        text storage_key
        jsonb parsed
        int score
        timestamptz created_at
    }
    coach_messages {
        bigserial id PK
        uuid user_id FK
        text role
        text content
        jsonb tool_calls
        timestamptz created_at
    }
```

Notes:
- Migrations: Supabase CLI SQL files in `supabase/migrations/` (ADR-018; replaces the earlier Alembic idea). `users` above is `auth.users` + `public.profiles`.
- `pgvector` for `resources.embedding` (RAG).
- Index `roadmaps(user_id)`, `roadmap_steps(roadmap_id, position)`, `progress_events(step_id, at)`.
- Scores (readiness and momentum) are computed server-side from `progress_events`, not stored.
- Privacy: support account deletion (cascade) and export; keep answers out of logs.
- Product analytics events go to an analytics tool (e.g. PostHog), not the primary DB.
