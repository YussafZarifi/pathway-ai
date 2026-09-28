"""Parse and validate Gemini's JSON replies for careers and roadmaps.

Two kinds of models live here:
- Generation schemas (CareerSchema, RoadmapSchema): every field required,
  sent to Gemini as `response_schema` so the reply has the right shape.
- Output models (Career, RoadmapStep): what the API returns. They accept
  imperfect replies: missing optional fields get defaults, bad list items
  (a resource without an http(s) URL, a task that isn't text) are dropped,
  and only items without their core field (a step without a title, a
  career without a title or match score) are rejected.

Nothing here logs or returns raw model output. AIOutputError carries a
kind and a content-free detail (error position, field paths, counts).
"""

import json
import re
from typing import Any
from urllib.parse import urlparse

from pydantic import BaseModel, Field, ValidationError, field_validator

MAX_STEPS = 5
MAX_CAREERS = 3
MAX_SKILLS = 8
MAX_LIST_ITEMS = 8


class AIOutputError(Exception):
    """A reply that can't be used. `detail` never contains model output."""

    def __init__(self, kind: str, detail: str = ""):
        super().__init__(f"{kind}: {detail}" if detail else kind)
        self.kind = kind
        self.detail = detail


# --- Generation schemas (sent to Gemini) ---------------------------------

class ResourceSchema(BaseModel):
    name: str
    url: str


class CareerItemSchema(BaseModel):
    title: str
    reason: str
    match_score: int
    salary_range: str
    growth_rate: str
    education: str
    skills: list[str]


class CareerSchema(BaseModel):
    careers: list[CareerItemSchema]
    explanation: str


class RoadmapStepSchema(BaseModel):
    title: str
    description: str
    time: str
    resources: list[ResourceSchema]
    tasks: list[str]
    video_query: str


class RoadmapSchema(BaseModel):
    career: str
    roadmap: list[RoadmapStepSchema]


# --- Output models (returned by the API) ---------------------------------

def _optional_text(value: Any, max_length: int) -> str:
    """Optional field: a wrong type becomes an empty string, not an error."""
    value = _clean_text(value, max_length)
    return value if isinstance(value, str) else ""


def _clean_text(value: Any, max_length: int) -> Any:
    if value is None:
        return ""
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        value = str(value)
    if isinstance(value, str):
        return " ".join(value.split())[:max_length]
    return value  # wrong type: let validation reject it


def _text_list(value: Any, max_items: int, max_length: int) -> list[str]:
    if not isinstance(value, list):
        return []
    items = (_clean_text(v, max_length) for v in value)
    return [v for v in items if isinstance(v, str) and v][:max_items]


def _is_web_url(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.scheme in ("http", "https") and bool(parsed.netloc)


class Resource(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    url: str = Field(min_length=1, max_length=500)

    @field_validator("name", "url", mode="before")
    @classmethod
    def _text(cls, v):
        return _clean_text(v, 500)

    @field_validator("url")
    @classmethod
    def _web_url(cls, v):
        if not _is_web_url(v):
            raise ValueError("not an http(s) URL")
        return v


class RoadmapStep(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = ""
    time: str = "Varies"
    resources: list[Resource] = []
    tasks: list[str] = []
    video_query: str = ""

    @field_validator("title", mode="before")
    @classmethod
    def _title(cls, v):
        return _clean_text(v, 200)

    @field_validator("description", "time", "video_query", mode="before")
    @classmethod
    def _optional(cls, v, info):
        return _optional_text(v, 1000 if info.field_name == "description" else 200)

    @field_validator("time")
    @classmethod
    def _time_default(cls, v):
        return v or "Varies"

    @field_validator("resources", mode="before")
    @classmethod
    def _valid_resources(cls, v):
        kept = []
        for item in v if isinstance(v, list) else []:
            try:
                kept.append(Resource.model_validate(item))
            except ValidationError:
                continue
        return kept[:MAX_LIST_ITEMS]

    @field_validator("tasks", mode="before")
    @classmethod
    def _tasks(cls, v):
        return _text_list(v, MAX_LIST_ITEMS, 300)


class Career(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    reason: str = ""
    match_score: int = Field(ge=0, le=100)
    salary_range: str = ""
    growth_rate: str = ""
    education: str = ""
    skills: list[str] = []

    @field_validator("title", mode="before")
    @classmethod
    def _title(cls, v):
        return _clean_text(v, 120)

    @field_validator("reason", "salary_range", "growth_rate", "education", mode="before")
    @classmethod
    def _optional(cls, v):
        return _optional_text(v, 600)

    @field_validator("match_score", mode="before")
    @classmethod
    def _score(cls, v):
        # Accept 85, 85.0, "85" and "85%"; anything else fails validation.
        if isinstance(v, bool):
            raise ValueError("not a number")
        if isinstance(v, str):
            match = re.fullmatch(r"\s*(\d{1,3}(?:\.\d+)?)\s*%?\s*", v)
            v = float(match.group(1)) if match else v
        if isinstance(v, float):
            v = round(v)
        return v

    @field_validator("skills", mode="before")
    @classmethod
    def _skills(cls, v):
        return _text_list(v, MAX_SKILLS, 60)


# --- Parsing ---------------------------------------------------------------

_FENCE = re.compile(r"```[a-zA-Z]*\s*\n?(.*?)```", re.DOTALL)
_TRAILING_COMMA = re.compile(r",(\s*[}\]])")


def extract_json(text: str) -> tuple[dict, str]:
    """Return (object, strategy). Strategy names how the JSON was found:
    "direct", "fenced", "braces", or "+trailing_commas" when that repair
    was needed. Raises AIOutputError."""
    text = (text or "").strip()
    if not text:
        raise AIOutputError("empty")

    candidates = [("direct", text)]
    fence = _FENCE.search(text)
    if fence:
        candidates.append(("fenced", fence.group(1).strip()))
    start, end = text.find("{"), text.rfind("}")
    if 0 <= start < end:
        candidates.append(("braces", text[start:end + 1]))

    first_error = None
    for strategy, candidate in candidates:
        for repair, attempt in ((strategy, candidate),
                                (strategy + "+trailing_commas", _TRAILING_COMMA.sub(r"\1", candidate))):
            try:
                value = json.loads(attempt)
            except json.JSONDecodeError as e:
                first_error = first_error or e
                continue
            if not isinstance(value, dict):
                raise AIOutputError("not_object", type(value).__name__)
            return value, repair

    if first_error is None or "{" not in text:
        raise AIOutputError("no_json", f"{len(text)} chars, no JSON object found")
    raise AIOutputError(
        "invalid_json", f"{first_error.msg} at char {first_error.pos} of {len(text)}"
    )


def _error_summary(error: ValidationError) -> str:
    # Field paths and error types only; include_input=False keeps values out.
    parts = [
        f"{'.'.join(str(p) for p in e['loc']) or '(root)'}:{e['type']}"
        for e in error.errors(include_input=False, include_url=False, include_context=False)
    ]
    return ",".join(parts[:5])


def _validate_items(raw: Any, model, limit: int) -> tuple[list[dict], list[str]]:
    """Validate each item on its own: keep good ones, describe dropped ones."""
    kept, dropped = [], []
    for index, item in enumerate(raw if isinstance(raw, list) else []):
        try:
            kept.append(model.model_validate(item).model_dump())
        except ValidationError as e:
            dropped.append(f"[{index}] {_error_summary(e)}")
    return kept[:limit], dropped


def parse_careers(text: str) -> tuple[dict, dict]:
    """Return ({careers, explanation}, diagnostics). Raises AIOutputError."""
    data, strategy = extract_json(text)
    if not isinstance(data.get("careers"), list):
        raise AIOutputError("schema", "careers missing or not a list")
    careers, dropped = _validate_items(data["careers"], Career, MAX_CAREERS)
    if not careers:
        raise AIOutputError("schema", "no valid careers; " + "; ".join(dropped[:3]))
    result = {"careers": careers, "explanation": _optional_text(data.get("explanation"), 1500)}
    return result, {"strategy": strategy, "items": len(careers), "dropped": dropped}


def parse_roadmap(text: str, career: str) -> tuple[dict, dict]:
    """Return ({career, roadmap}, diagnostics). Raises AIOutputError.

    `career` is the one the user chose; the model's echo of it is ignored."""
    data, strategy = extract_json(text)
    if not isinstance(data.get("roadmap"), list):
        raise AIOutputError("schema", "roadmap missing or not a list")
    steps, dropped = _validate_items(data["roadmap"], RoadmapStep, MAX_STEPS)
    if not steps:
        raise AIOutputError("schema", "no valid steps; " + "; ".join(dropped[:3]))
    return {"career": career, "roadmap": steps}, {"strategy": strategy, "items": len(steps), "dropped": dropped}

