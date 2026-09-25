# Coding Standards

These describe the conventions already in the codebase plus rules adopted after the 2026-09-24 audit. New code follows them. Existing violations are tracked in `technical-debt.md`.

## General
- **Honesty rule:** never ship fake data, simulated AI results or buttons that do nothing. If a feature isn't built, hide it or disable it with honest copy.
- Small, focused changes. One concern per commit. Conventional commit prefixes (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`).
- Delete dead code rather than leaving it "for later". Git keeps history.
- No secrets in code or commits. Config comes from environment variables, with `.env.example` documenting them.
- A task is done only when lint passes, tests pass (once they exist) and docs are updated if behaviour changed.

## Frontend (React / JS)
- Function components + hooks. One component per file, PascalCase filename matching the default export.
- Match the existing style: 2-space indent, double quotes, semicolons, camelCase CSS class names (`careerCard`, `timelineStep`).
- **Pages** in `src/pages/`, reusable UI in `src/components/`, non-UI logic in `src/lib/`, static data in `src/data/`.
- **Network:** all requests go through `src/lib/api.js` (to be created) using `import.meta.env.VITE_API_URL`. No `fetch` with hard-coded URLs in components. Always handle abort, error and empty states.
- **State:** keep state local where possible. Don't use router `state` as the only copy of important data; persist it.
- **Pure render and pure updaters:** no side effects (tracking, storage, network) inside render bodies or `setState` updater functions. Put them in event handlers or effects.
- **Effects:** complete dependency arrays. If you must suppress `react-hooks/exhaustive-deps`, explain why in a comment.
- **Keys:** stable IDs, not array indexes, for lists that can reorder or change.
- **Accessibility:** interactive things are `<button>` or `<a>`, never clickable `<div>`s. No interactive element inside another. Icon-only buttons get `aria-label`. Modals use dialog semantics, focus trap, Esc and focus return. Respect `prefers-reduced-motion`.
- **AI output rendering:** treat it as untrusted. Default missing fields; only render `https:` URLs as links, with `rel="noopener noreferrer"`.
- **Styling:** use CSS variables for colours, spacing and radii (add tokens rather than new literals). Avoid `!important` and inline styles, except for dynamic values like widths and percentages.
- Remove `console.log` debugging before committing. Use `console.error` only in real error paths.
- Tracking event and metric names come from `EVENT_TYPES` / `METRIC_NAMES`. Never pass raw strings.

## Backend (Python / FastAPI)
- PEP 8, type hints everywhere, `ruff` for lint and format (to be added).
- Every endpoint has Pydantic **request and response** models.
- Config through `pydantic-settings`. No `os.getenv` scattered through handlers.
- Don't return `str(exception)` to clients. Log it server-side with a request ID and return a generic message plus an error code.
- Never log user answers, resume contents or other personal data.
- All LLM calls go through one service module (timeouts, retries, schema validation, caching, token logging).
- External calls have timeouts. Prefer `async` clients once the service layer exists.

## Testing
- New logic in `src/lib/` or backend services comes with unit tests.
- Bug fixes include a test that fails before the fix.
- Mock the LLM in tests. Never call Gemini from CI unit tests.
See `testing.md`.

## Documentation
- At the end of each coding session update `CLAUDE.md`, `ROADMAP.md`, `SESSION.md` and `docs/decisions.md`.
- Keep *Implemented / Partially implemented / Planned* distinct in all docs.
