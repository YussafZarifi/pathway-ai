# Data & Database

## Current state (✅): no database

All persistence is **client-side**, in one `localStorage` key: `pathwayai_tracking`.

```jsonc
{
  "version": "1.0.0",
  "events":   [ { "id": "1727…_ab12cd34", "type": "quiz_completed", "payload": { … }, "timestamp": 1727… } ],
  "metrics":  { "resume_score": { "values": [{ "value": 72, "timestamp": … }], "current": 72, "average": 72, "max": 72, "min": 72, "lastUpdated": … } },
  "progress": { "roadmap_step_0": { "started": null, "completed": 1727…, "skipped": false, "attempts": 0, "lastStatus": "completed", "lastUpdated": …, "metadata": {} } },
  "sessionStartTime": …, "lastSessionStart": …, "totalSessions": 3,
  "totalScreensViewed": 41,   // ⚠ incremented on every event, not screens
  "actionsCompleted": 41
}
```

- Event types and metric names: `frontend/src/data/trackingSchema.js` (the string values are a persistence contract).
- `validateEvent` checks required payload fields only.
- **Not stored anywhere:** the generated careers and the roadmap. They live only in React Router `location.state`.

### Problems
- Progress keys aren't scoped to a roadmap (`roadmap_step_<index>`) → collisions across careers.
- `events[]` grows forever. `getTrackingData()` parses and **re-writes** the whole blob on every read.
- `quiz_completed` and per-question events store raw answers (including free text) in the browser.
- No sync across devices; clearing site data wipes everything.
- The ~5 MB localStorage quota will eventually be reached, and failures are only logged to the console.

## Short-term plan (🟡 next sprint)
Keep localStorage, but restructure:
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
- Migrations: Alembic. ORM: SQLAlchemy 2 / SQLModel.
- `pgvector` for `resources.embedding` (RAG).
- Index `roadmaps(user_id)`, `roadmap_steps(roadmap_id, position)`, `progress_events(step_id, at)`.
- Scores (readiness and momentum) are computed server-side from `progress_events`, not stored.
- Privacy: support account deletion (cascade) and export; keep answers out of logs.
- Product analytics events go to an analytics tool (e.g. PostHog), not the primary DB.
