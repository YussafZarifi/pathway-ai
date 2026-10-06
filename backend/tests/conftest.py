import json
import os
import sys
from types import SimpleNamespace

import pytest

# Tests never call real APIs: no keys, and a fixed origin for CORS checks.
os.environ["GEMINI_API_KEY"] = "test-key"
os.environ["YOUTUBE_API_KEY"] = ""
os.environ["ALLOWED_ORIGINS"] = "http://localhost:5173"
# Never reach the real database from tests, whatever backend/.env says
# (load_dotenv doesn't override variables that are already set).
os.environ["DATABASE_URL"] = ""

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Planted in answers and model replies; must never appear in logs or errors.
SECRET = "SECRET-MARKER-7f3a"

# The 5-question quiz (v2), as the new frontend sends it.
ANSWERS_V2 = {
    "interests": ["Building apps", "Analyzing data"],
    "problem_style": "Dig in until I find the root cause",
    "experience": "Built a few projects",
    "weekly_hours": 10,
    "goal": "Get my first tech job",
    "career_in_mind": f"data engineer {SECRET}",
}

# The original 8-question quiz (v1): still sent by "Regenerate" for
# roadmaps saved before the new quiz.
ANSWERS = {
    "stage": "College / University",
    "goal": "Get an internship/job",
    "interest_area": "Cloud & DevOps",
    "work_style": "Hands-on / practical",
    "experience_level": 1,
    "education_comfort": 2,
    "environment": "Remote / Freelance",
    "curious_fields": f"DevOps {SECRET}",
}


def roadmap_reply(**overrides):
    step = {
        "title": "Linux basics",
        "description": "Learn the command line.",
        "time": "2-3 weeks",
        "resources": [{"name": "Linux Journey", "url": "https://linuxjourney.com"}],
        "tasks": ["Install Ubuntu", "Write a shell script"],
        "video_query": "linux command line for beginners",
    }
    step.update(overrides)
    return {"career": "DevOps Engineer", "roadmap": [step]}


def career_reply():
    return {
        "careers": [
            {
                "title": "Cloud Engineer",
                "reason": "Fits your interest in cloud.",
                "match_score": 88,
                "salary_range": "$80k - $120k",
                "growth_rate": "+15% (Faster than average)",
                "education": "Bachelor's degree",
                "skills": ["AWS", "Linux", "Terraform", "Python"],
            }
        ],
        "explanation": "A good start.",
    }


class FakeModels:
    """Stands in for client.models: replays a script of replies/exceptions."""

    def __init__(self, script):
        self.script = list(script)
        self.calls = 0
        self.prompts = []
        self.configs = []

    def generate_content(self, model, contents, config=None):
        self.calls += 1
        self.prompts.append(contents)
        self.configs.append(config)
        item = self.script.pop(0)
        if isinstance(item, BaseException):
            raise item
        text = item if isinstance(item, str) else json.dumps(item)
        return SimpleNamespace(
            text=text,
            candidates=[SimpleNamespace(finish_reason=SimpleNamespace(name="STOP"))],
            usage_metadata=SimpleNamespace(prompt_token_count=500, candidates_token_count=900),
        )


@pytest.fixture
def fake_gemini(monkeypatch):
    """Install a scripted Gemini client; returns a setter for the script."""
    import llm

    def install(*script):
        models = FakeModels(script)
        monkeypatch.setattr(llm, "client", SimpleNamespace(models=models))
        return models

    monkeypatch.setattr(llm.time, "sleep", lambda seconds: None)
    return install
