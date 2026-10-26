from types import SimpleNamespace

import pytest

from rag.embeddings import EmbeddingProviderError, GeminiEmbeddingProvider


class FakeEmbeddingModels:
    def __init__(self, responses):
        self.responses = list(responses)
        self.requests = []

    def embed_content(self, *, model, contents, config):
        self.requests.append((model, contents, config))
        return SimpleNamespace(embeddings=[SimpleNamespace(values=value) for value in self.responses.pop(0)])


def test_gemini_embedding_provider_uses_retrieval_tasks_and_normalizes_vectors():
    models = FakeEmbeddingModels([[[3.0, 4.0], [0.0, 2.0]], [[1.0, 0.0]]])
    provider = GeminiEmbeddingProvider(
        client=SimpleNamespace(models=models), model="gemini-embedding-001", dimensions=2
    )

    assert provider.embed_documents(["first guidance", "second guidance"]) == [[0.6, 0.8], [0.0, 1.0]]
    assert provider.embed_query("project impact") == [[1.0, 0.0]][0]
    assert [request[2].task_type for request in models.requests] == [
        "RETRIEVAL_DOCUMENT", "RETRIEVAL_QUERY",
    ]
    assert all(request[2].output_dimensionality == 2 for request in models.requests)


def test_gemini_embedding_provider_rejects_invalid_embedding_responses():
    provider = GeminiEmbeddingProvider(
        client=SimpleNamespace(models=FakeEmbeddingModels([[[1.0]]])),
        model="gemini-embedding-001", dimensions=2,
    )

    with pytest.raises(EmbeddingProviderError, match="invalid_response"):
        provider.embed_query("project impact")
