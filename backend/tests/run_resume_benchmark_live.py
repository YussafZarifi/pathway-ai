"""Run synthetic résumé benchmarks against Gemini only when explicitly enabled.

Usage from ``backend``:
  $env:RUN_RESUME_BENCHMARK_LIVE='1'
  .venv/Scripts/python.exe tests/run_resume_benchmark_live.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

TESTS = Path(__file__).resolve().parent
sys.path.insert(0, str(TESTS.parent))
sys.path.insert(0, str(TESTS))
from resume_ai import analyze_resume
from resume_benchmarks import live_model_enabled, live_report, load_cases, run_live_case


def main() -> int:
    if not live_model_enabled():
        print("Set RUN_RESUME_BENCHMARK_LIVE=1 to run the synthetic live-model suite.")
        return 2
    results = [
        run_live_case(
            case,
            lambda pdf, role, skills: analyze_resume(pdf, role, skills, []),
        )
        for case in load_cases()
    ]
    report = live_report(results)
    failures = [result for result in results if result["status"] != "passed"]
    # Results intentionally include identifiers and assertion names only.
    print(json.dumps(report, indent=2))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
