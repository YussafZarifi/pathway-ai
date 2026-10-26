"""Small deterministic vector index used until a persistent store is wired in."""

from __future__ import annotations

from dataclasses import dataclass

from rag.models import GuidanceChunk, RetrievedGuidance, normalized_role


@dataclass(frozen=True)
class _Record:
    chunk: GuidanceChunk
    vector: tuple[float, ...]


class InMemoryVectorIndex:
    """Cosine-ranked index with strict criterion, level, and role filters."""

    def __init__(self, *, dimensions: int):
        self.dimensions = dimensions
        self._records: list[_Record] = []

    def add(self, chunks: list[GuidanceChunk], vectors: list[list[float]]) -> None:
        if len(chunks) != len(vectors):
            raise ValueError("each guidance chunk needs one embedding")
        if len({chunk.id for chunk in chunks}) != len(chunks):
            raise ValueError("guidance chunk IDs must be unique")
        if any(len(vector) != self.dimensions for vector in vectors):
            raise ValueError("embedding dimensions do not match the index")
        self._records.extend(_Record(chunk, tuple(vector)) for chunk, vector in zip(chunks, vectors, strict=True))

    def search(self, query_vector: list[float], *, criterion_ids: tuple[str, ...], target_level: str,
               target_role: str, limit: int) -> list[RetrievedGuidance]:
        if len(query_vector) != self.dimensions:
            raise ValueError("query dimensions do not match the index")
        criteria = set(criterion_ids)
        role = normalized_role(target_role)
        matches = []
        for record in self._records:
            chunk = record.chunk
            if not criteria.intersection(chunk.criterion_ids):
                continue
            if chunk.level not in {"all", target_level}:
                continue
            if normalized_role(chunk.role) not in {"all", role}:
                continue
            score = sum(left * right for left, right in zip(query_vector, record.vector, strict=True))
            matches.append(RetrievedGuidance(chunk=chunk, score=score))
        return sorted(matches, key=lambda item: (-item.score, item.chunk.id))[:limit]
