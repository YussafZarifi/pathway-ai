"""Deterministic, section-preserving chunking for curated guidance."""

from __future__ import annotations

import hashlib
import re

from rag.models import GuidanceChunk, GuidanceDocument


MAX_CHUNK_CHARS = 900
_SENTENCE_BOUNDARY = re.compile(r"(?<=[.!?])\s+")


def _split_long_unit(text: str, limit: int) -> list[str]:
    sentences = _SENTENCE_BOUNDARY.split(text)
    parts, current = [], ""
    for sentence in sentences:
        fragments = []
        while len(sentence) > limit:
            cutoff = sentence.rfind(" ", 0, limit + 1)
            cutoff = cutoff if cutoff > 0 else limit
            fragments.append(sentence[:cutoff].strip())
            sentence = sentence[cutoff:].strip()
        fragments.append(sentence)
        for fragment in fragments:
            candidate = f"{current} {fragment}".strip()
            if current and len(candidate) > limit:
                parts.append(current)
                current = fragment
            else:
                current = candidate
    if current:
        parts.append(current)
    return parts


def _text_chunks(text: str, limit: int) -> list[str]:
    units = []
    for paragraph in re.split(r"\n\s*\n", text):
        paragraph = " ".join(paragraph.split())
        if paragraph:
            units.extend(_split_long_unit(paragraph, limit) if len(paragraph) > limit else [paragraph])

    chunks, current = [], ""
    for unit in units:
        candidate = f"{current}\n\n{unit}".strip()
        if current and len(candidate) > limit:
            chunks.append(current)
            current = unit
        else:
            current = candidate
    if current:
        chunks.append(current)
    return chunks


def chunk_documents(documents: list[GuidanceDocument], *, max_chars: int = MAX_CHUNK_CHARS) -> list[GuidanceChunk]:
    """Turn reviewed sections into stable, metadata-complete chunks."""
    if not 100 <= max_chars <= MAX_CHUNK_CHARS:
        raise ValueError(f"max_chars must be between 100 and {MAX_CHUNK_CHARS}")
    chunks = []
    for document in documents:
        for section_index, section in enumerate(document.sections):
            for part_index, text in enumerate(_text_chunks(section.text, max_chars)):
                identity = "|".join((document.collection, document.source, document.title, document.version,
                                     str(section_index), str(part_index), text))
                chunks.append(GuidanceChunk(
                    id=hashlib.sha256(identity.encode("utf-8")).hexdigest()[:24],
                    collection=document.collection, source=document.source, title=document.title,
                    section=section.title, topic=section.topic, criterion_ids=section.criterion_ids,
                    role=document.role, level=document.level, version=document.version, text=text,
                ))
    return chunks
