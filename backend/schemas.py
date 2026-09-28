"""Request models for the AI endpoints.

Two quiz formats are accepted (ADR-016):
- v2, the 5-question quiz (since 2026-09-28): identified by its
  `interests` list;
- v1, the original 8-question quiz: still sent by "Regenerate" for
  roadmaps saved before the change. Remove once no saved roadmap needs it.

Field names are the quiz question IDs in frontend/src/data/questions.js.
Choice answers are length-limited strings rather than fixed option lists,
so editing an option's wording in the frontend doesn't break the API.
Unknown keys are ignored and never reach the prompt.
"""

import json
import re
from typing import Annotated, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Discriminator, Field, Tag, field_validator

MAX_CHOICE_LENGTH = 80
MAX_TEXT_LENGTH = 300  # v1 free-text answer
MAX_CAREER_LENGTH = 100  # career title, and v2 "career in mind" (quiz maxLength)
MAX_INTERESTS = 3

_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")

Choice = Annotated[str, Field(min_length=1, max_length=MAX_CHOICE_LENGTH)]


def _clean(value):
    # Newlines and other control characters could restructure the prompt.
    if isinstance(value, str):
        return _CONTROL_CHARS.sub(" ", value).strip()
    return value


class QuizAnswersV1(BaseModel):
    """The original 8-question quiz."""

    model_config = ConfigDict(extra="ignore")
    version: int = Field(default=1, exclude=True)

    stage: Choice
    goal: Choice
    interest_area: Choice
    work_style: Choice
    experience_level: int = Field(ge=0, le=10)
    education_comfort: int = Field(ge=0, le=6)
    environment: Choice
    curious_fields: Optional[str] = Field(default=None, max_length=MAX_TEXT_LENGTH)

    _strip = field_validator(
        "stage", "goal", "interest_area", "work_style", "environment", "curious_fields",
        mode="before",
    )(_clean)

    def as_profile_text(self) -> str:
        """One "question_id: answer" line per answered question."""
        return "\n".join(
            f"{key}: {value}"
            for key, value in self.model_dump().items()
            if value not in (None, "")
        )


class QuizAnswersV2(BaseModel):
    """The 5-question quiz: interests, problem-solving style, experience,
    weekly time and 12-month goal, plus an optional career in mind."""

    model_config = ConfigDict(extra="ignore")
    version: int = Field(default=2, exclude=True)

    interests: list[Choice] = Field(min_length=1, max_length=MAX_INTERESTS)
    problem_style: Choice
    experience: Choice
    weekly_hours: Literal[2, 5, 10, 20]  # 20 means "20 or more"
    goal: Choice
    career_in_mind: Optional[str] = Field(default=None, max_length=MAX_CAREER_LENGTH)

    _strip = field_validator(
        "problem_style", "experience", "goal", "career_in_mind", mode="before"
    )(_clean)

    @field_validator("interests", mode="before")
    @classmethod
    def _clean_interests(cls, value):
        if not isinstance(value, list):
            return value
        cleaned = [_clean(v) for v in value]
        # Drop duplicates, keeping the user's order.
        return list(dict.fromkeys(cleaned))

    def hours_text(self) -> str:
        return "20 or more hours" if self.weekly_hours == 20 else f"about {self.weekly_hours} hours"

    def as_profile_text(self) -> str:
        """Labelled lines, so the model knows what each answer means."""
        lines = [
            f"Excited by: {'; '.join(self.interests)}",
            f"Problem-solving style: {self.problem_style}",
            f"Experience level: {self.experience}",
            f"Time available: {self.hours_text()} per week",
            f"Goal for the next 12 months: {self.goal}",
        ]
        if self.career_in_mind:
            # JSON-quoted so the user's text reads as one value, not as prose.
            lines.append(f"Career already in mind: {json.dumps(self.career_in_mind)}")
        return "\n".join(lines)


def _answers_version(value) -> str:
    if isinstance(value, BaseModel):
        return "v2" if isinstance(value, QuizAnswersV2) else "v1"
    return "v2" if isinstance(value, dict) and "interests" in value else "v1"


QuizAnswers = Annotated[
    Union[Annotated[QuizAnswersV2, Tag("v2")], Annotated[QuizAnswersV1, Tag("v1")]],
    Discriminator(_answers_version),
]


class CareerRequest(BaseModel):
    answers: QuizAnswers


class RoadmapRequest(BaseModel):
    answers: QuizAnswers
    career: Annotated[str, Field(min_length=1, max_length=MAX_CAREER_LENGTH)]

    _strip = field_validator("career", mode="before")(_clean)
