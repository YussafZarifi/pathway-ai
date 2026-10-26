# Testing

## Version 1.0 verification

The release verification run on 2026-10-26 passed:

- **Backend:** 674 pytest tests.
- **Frontend:** 182 Vitest tests and ESLint with no errors.
- **Build:** `vite build` passed. Vite reports a non-blocking large-chunk warning for the PDF and HTML-to-PDF bundles.
- **Browser:** 3 Playwright checks passed; 1 test was skipped by the suite.

All default tests are deterministic and do not call Gemini, Supabase or YouTube. The test backend uses fakes and in-memory repositories. Real-model résumé benchmark evaluation is opt-in with `RUN_RESUME_BENCHMARK_LIVE=1` and uses synthetic fixtures only.

## Backend

`backend/tests/` covers API validation, authentication, request limits, repositories, PDF boundaries, deterministic résumé evidence verification and scoring, RAG retrieval, prompt assembly, coaching validation and production fail-open behavior.

`backend/tests/fixtures/resume_benchmarks/` contains synthetic, de-identified PDFs and expected signals. Fixture validation rejects non-synthetic cases. The deterministic harness checks section extraction, page/evidence mapping, report shape, score behavior and false-positive rules; live-model comparison remains opt-in.

Run:

```bash
cd backend
pip install -r requirements-dev.txt
python -m pytest -q
```

## Frontend

Vitest and Testing Library cover the API client, account and résumé session behavior, Resume Analyzer upload/preview/restore flow, target-level propagation, deterministic report rendering and optional coaching states. Browser tests run the application with local mocked services and synthetic PDF data.

Run:

```bash
cd frontend
npm run lint
npm test
npm run build
npm run test:e2e
```

Install Chromium once when needed:

```bash
cd frontend
npx playwright install chromium
```

Playwright writes failure traces, reports and screenshots to ignored test-artifact directories. `frontend/output/` is also ignored because it contains manually generated visual-review screenshots, not test fixtures.

## Test rules

- Never use a personal résumé, API key or production credential in a test.
- Keep résumé fixtures synthetic or de-identified.
- Mock the Gemini client for normal test runs; do not enable live benchmarks in CI by default.
- Treat unsupported model claims, wrong-page citations and invented skills, employers, technologies or metrics as failures.
- Keep deterministic analysis authoritative: RAG coaching may be unavailable, but it must never change scores, verified findings or citations.
