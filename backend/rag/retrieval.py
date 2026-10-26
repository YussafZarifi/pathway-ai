"""Public retrieval contract used by additive résumé coaching."""

from __future__ import annotations

from rag.chunking import chunk_documents
from rag.embeddings import EmbeddingProvider
from rag.index import InMemoryVectorIndex
from rag.models import GuidanceDocument, RetrievalRequest, RetrievedGuidance


def diversify_guidance(candidates: list[RetrievedGuidance], limit: int) -> list[RetrievedGuidance]:
    """Prefer distinct curated topics without admitting an irrelevant chunk."""
    selected, topics, selected_ids = [], set(), set()
    for candidate in candidates:
        topic = (candidate.chunk.collection, candidate.chunk.topic.casefold())
        if topic in topics:
            continue
        selected.append(candidate)
        topics.add(topic)
        selected_ids.add(candidate.chunk.id)
        if len(selected) == limit:
            return selected
    for candidate in candidates:
        if candidate.chunk.id not in selected_ids:
            selected.append(candidate)
            if len(selected) == limit:
                break
    return selected


class GuidanceRetriever:
    def __init__(self, provider: EmbeddingProvider, index: InMemoryVectorIndex):
        self._provider = provider
        self._index = index

    @classmethod
    def from_documents(cls, documents: list[GuidanceDocument], provider: EmbeddingProvider) -> "GuidanceRetriever":
        chunks = chunk_documents(documents)
        index = InMemoryVectorIndex(dimensions=provider.dimensions)
        index.add(chunks, provider.embed_documents([
            f"{chunk.title} {chunk.section} {chunk.topic} {' '.join(chunk.criterion_ids)} {chunk.text}"
            for chunk in chunks
        ]))
        return cls(provider, index)

    def retrieve(self, *, criterion_ids: list[str], target_level: str, target_role: str,
                 limit: int = 3) -> list[RetrievedGuidance]:
        request = RetrievalRequest(
            criterion_ids=tuple(criterion_ids), target_level=target_level,
            target_role=target_role, limit=limit,
        )
        query = " ".join(("resume guidance", *request.criterion_ids, request.target_level, request.target_role))
        candidates = self._index.search(
            self._provider.embed_query(query), criterion_ids=request.criterion_ids,
            target_level=request.target_level, target_role=request.target_role, limit=request.limit * 3,
        )
        return diversify_guidance(candidates, request.limit)
