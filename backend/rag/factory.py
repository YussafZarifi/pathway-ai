"""Construct a selectable retrieval implementation without analyzer coupling."""

from __future__ import annotations

import config
from rag.embeddings import EmbeddingProvider
from rag.langchain_retriever import LangChainRetriever
from rag.models import GuidanceDocument
from rag.retrieval import GuidanceRetriever


def build_guidance_retriever(documents: list[GuidanceDocument], provider: EmbeddingProvider):
    if config.RAG_RETRIEVER == "native":
        return GuidanceRetriever.from_documents(documents, provider)
    if config.RAG_RETRIEVER == "langchain":
        return LangChainRetriever.from_documents(documents, provider)
    raise RuntimeError("RAG_RETRIEVER must be native or langchain")
