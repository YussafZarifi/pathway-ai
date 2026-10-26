"""Optional LangChain adapter for the native résumé-guidance retrieval contract."""

from __future__ import annotations

from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings
from langchain_core.vectorstores import InMemoryVectorStore

from rag.chunking import chunk_documents
from rag.embeddings import EmbeddingProvider
from rag.models import GuidanceChunk, GuidanceDocument, RetrievalRequest, RetrievedGuidance, normalized_role
from rag.retrieval import diversify_guidance


class _ProviderEmbeddings(Embeddings):
    """Adapts PathwayAI's provider-neutral interface to LangChain's protocol."""

    def __init__(self, provider: EmbeddingProvider):
        self._provider = provider

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return self._provider.embed_documents(texts)

    def embed_query(self, text: str) -> list[float]:
        return self._provider.embed_query(text)


def _matches(document: Document, request: RetrievalRequest) -> bool:
    metadata = document.metadata
    if not set(request.criterion_ids).intersection(metadata["criterion_ids"]):
        return False
    if metadata["level"] not in {"all", request.target_level}:
        return False
    return normalized_role(metadata["role"]) in {"all", normalized_role(request.target_role)}


class LangChainRetriever:
    """LangChain vector-store implementation of ``GuidanceRetriever.retrieve``."""

    def __init__(self, store: InMemoryVectorStore, document_count: int):
        self._store = store
        self._document_count = document_count

    @classmethod
    def from_documents(cls, documents: list[GuidanceDocument], provider: EmbeddingProvider) -> "LangChainRetriever":
        chunks = chunk_documents(documents)
        store = InMemoryVectorStore(_ProviderEmbeddings(provider))
        store.add_documents([
            Document(
                id=chunk.id,
                page_content=chunk.text,
                metadata=chunk.model_dump(exclude={"id", "text"}),
            )
            for chunk in chunks
        ])
        return cls(store, len(chunks))

    def retrieve(self, *, criterion_ids: list[str], target_level: str, target_role: str,
                 limit: int = 3) -> list[RetrievedGuidance]:
        request = RetrievalRequest(
            criterion_ids=tuple(criterion_ids), target_level=target_level,
            target_role=target_role, limit=limit,
        )
        query = " ".join(("resume guidance", *request.criterion_ids, request.target_level, request.target_role))
        results = self._store.similarity_search_with_score(
            query, k=self._document_count, filter=lambda document: _matches(document, request),
        )
        candidates = [
            RetrievedGuidance(
                chunk=GuidanceChunk(id=str(document.id), text=document.page_content, **document.metadata),
                score=max(-1.0, min(1.0, float(score))),
            )
            for document, score in results
        ]
        return diversify_guidance(candidates, request.limit)
