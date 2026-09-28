"""Request models for the AI endpoints.

Field names are the quiz question IDs in frontend/src/data/questions.js.
Choice answers are length-limited strings rather than fixed option lists,
so editing an option's wording in the frontend doesn't break the API.
Unknown keys are ignored and never reach the prompt.
"""

import re
from typing import Annotated, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

MAX_CHOICE_LENGTH = 80
MAX_TEXT_LENGTH = 300  # matches maxLength on the quiz text input
MAX_CAREER_LENGTH = 100

_CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")

Choice = Annotated[str, Field(min_length=1, max_length=MAX_CHOICE_LENGTH)]


def _clean(value):
    # Newlines and other control characters could restructure the prompt.
    if isinstance(value, str):
        return _CONTROL_CHARS.sub(" ", value).strip()
    return value


class QuizAnswers(BaseModel):
    model_config = ConfigDict(extra="ignore")

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


class CareerRequest(BaseModel):
    answers: QuizAnswers


class RoadmapRequest(BaseModel):
    answers: QuizAnswers
    career: Annotated[str, Field(min_length=1, max_length=MAX_CAREER_LENGTH)]

    _strip = field_validator("career", mode="before")(_clean)
