"""Embedding-provider boundary and a deterministic local test implementation."""

from __future__ import annotations

import hashlib
import math
import re
from typing import Protocol

from google.genai import errors as genai_errors
from google.genai import types as genai_types

import config
import llm


class EmbeddingProvider(Protocol):
    dimensions: int

    def embed_documents(self, texts: list[str]) -> list[list[float]]: ...

    def embed_query(self, text: str) -> list[float]: ...


class EmbeddingProviderError(Exception):
    """Content-free failure for a semantic embedding provider."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


class GeminiEmbeddingProvider:
    """Gemini semantic embeddings behind PathwayAI's provider-neutral protocol."""

    def __init__(self, *, client=None, model: str | None = None, dimensions: int | None = None):
        self._client = client if client is not None else llm.client
        self._model = model or config.GEMINI_EMBEDDING_MODEL
        self.dimensions = dimensions or config.GEMINI_EMBEDDING_DIMENSIONS
        if self.dimensions < 1:
            raise ValueError("embedding dimensions must be positive")

    def _embed(self, texts: list[str], task_type: str) -> list[list[float]]:
        if not texts:
            return []
        if self._client is None:
            raise EmbeddingProviderError("unavailable")
        try:
            response = self._client.models.embed_content(
                model=self._model,
                contents=texts,
                config=genai_types.EmbedContentConfig(
                    task_type=task_type,
                    output_dimensionality=self.dimensions,
                ),
            )
            vectors = [list(item.values or []) for item in (response.embeddings or [])]
        except (genai_errors.APIError, TimeoutError, OSError):
            raise EmbeddingProviderError("failed") from None
        except Exception:
            raise EmbeddingProviderError("failed") from None
        if len(vectors) != len(texts) or any(len(vector) != self.dimensions for vector in vectors):
            raise EmbeddingProviderError("invalid_response")
        normalized = []
        for vector in vectors:
            magnitude = math.sqrt(sum(value * value for value in vector))
            if not magnitude:
                raise EmbeddingProviderError("invalid_response")
            normalized.append([value / magnitude for value in vector])
        return normalized

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return self._embed(texts, "RETRIEVAL_DOCUMENT")

    def embed_query(self, text: str) -> list[float]:
        return self._embed([text], "RETRIEVAL_QUERY")[0]


def build_embedding_provider() -> EmbeddingProvider:
    if config.RAG_EMBEDDING_PROVIDER == "gemini":
        return GeminiEmbeddingProvider()
    raise RuntimeError("RAG_EMBEDDING_PROVIDER must be gemini")


class DeterministicEmbeddingProvider:
    """Hashing embeddings for local tests; never a substitute for a hosted model."""

    def __init__(self, *, dimensions: int = 256):
        if dimensions < 8:
            raise ValueError("dimensions must be at least 8")
        self.dimensions = dimensions

    def _embed(self, text: str) -> list[float]:
        tokens = re.findall(r"[a-z0-9]+", text.casefold())
        if not tokens:
            raise ValueError("embedding text must contain a token")
        values = [0.0] * self.dimensions
        for token in tokens:
            digest = hashlib.sha256(token.encode("utf-8")).digest()
            index = int.from_bytes(digest[:8], "big") % self.dimensions
            values[index] += -1.0 if digest[8] & 1 else 1.0
        magnitude = math.sqrt(sum(value * value for value in values))
        return [value / magnitude for value in values]

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._embed(text) for text in texts]

    def embed_query(self, text: str) -> list[float]:
        return self._embed(text)
