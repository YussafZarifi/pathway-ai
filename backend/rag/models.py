"""Validated data contracts for the curated résumé-guidance corpus."""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


Collection = Literal[
    "resume_best_practices",
    "ats_guidance",
    "entry_level_role_rubrics",
    "internship_role_rubrics",
]
Level = Literal["all", "internship", "entry_level"]
_CRITERION_ID = re.compile(r"^[a-z][a-z0-9_]{1,63}$")


def normalized_text(value: str) -> str:
    return " ".join(str(value).split())


def normalized_role(value: str) -> str:
    return normalized_text(value).casefold()


class GuidanceSection(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    title: str = Field(min_length=1, max_length=120)
    topic: str = Field(min_length=1, max_length=120)
    criterion_ids: tuple[str, ...] = Field(min_length=1, max_length=12)
    text: str = Field(min_length=1, max_length=12_000)

    @field_validator("title", "topic", "text", mode="before")
    @classmethod
    def clean_text(cls, value):
        cleaned = normalized_text(value)
        if not cleaned:
            raise ValueError("must not be blank")
        return cleaned

    @field_validator("criterion_ids")
    @classmethod
    def valid_criteria(cls, values):
        cleaned = tuple(dict.fromkeys(normalized_text(value).casefold() for value in values))
        if not cleaned or any(not _CRITERION_ID.fullmatch(value) for value in cleaned):
            raise ValueError("must contain valid criterion IDs")
        return cleaned


class GuidanceDocument(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    collection: Collection
    source: str = Field(min_length=1, max_length=160)
    title: str = Field(min_length=1, max_length=160)
    version: str = Field(min_length=1, max_length=40)
    role: str = Field(min_length=1, max_length=100)
    level: Level
    sections: tuple[GuidanceSection, ...] = Field(min_length=1, max_length=40)

    @field_validator("source", "title", "version", "role", mode="before")
    @classmethod
    def clean_metadata(cls, value):
        cleaned = normalized_text(value)
        if not cleaned:
            raise ValueError("must not be blank")
        return cleaned


class GuidanceChunk(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    id: str = Field(min_length=12, max_length=64)
    collection: Collection
    source: str = Field(min_length=1, max_length=160)
    title: str = Field(min_length=1, max_length=160)
    section: str = Field(min_length=1, max_length=120)
    topic: str = Field(min_length=1, max_length=120)
    criterion_ids: tuple[str, ...] = Field(min_length=1, max_length=12)
    role: str = Field(min_length=1, max_length=100)
    level: Level
    version: str = Field(min_length=1, max_length=40)
    text: str = Field(min_length=1, max_length=1_000)


class RetrievalRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    criterion_ids: tuple[str, ...] = Field(min_length=1, max_length=12)
    target_level: Literal["internship", "entry_level"]
    target_role: str = Field(min_length=1, max_length=100)
    limit: int = Field(default=3, ge=1, le=10)

    @field_validator("criterion_ids")
    @classmethod
    def valid_query_criteria(cls, values):
        return GuidanceSection.valid_criteria(values)

    @field_validator("target_role", mode="before")
    @classmethod
    def clean_target_role(cls, value):
        cleaned = normalized_text(value)
        if not cleaned:
            raise ValueError("must not be blank")
        return cleaned


class RetrievedGuidance(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    chunk: GuidanceChunk
    score: float = Field(ge=-1, le=1)
