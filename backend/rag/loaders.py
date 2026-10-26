"""Local, versioned guidance-document loaders. No network sources are used."""

from __future__ import annotations

import json
from pathlib import Path

from rag.models import GuidanceDocument


KNOWLEDGE_ROOT = Path(__file__).with_name("knowledge")


def load_document(path: Path) -> GuidanceDocument:
    """Load one reviewed JSON document, failing closed on invalid content."""
    if path.suffix != ".json":
        raise ValueError("guidance documents must be JSON files")
    return GuidanceDocument.model_validate_json(path.read_text(encoding="utf-8"))


def load_documents(directory: Path) -> list[GuidanceDocument]:
    """Load a deterministic, complete collection from a local directory."""
    if not directory.is_dir():
        raise ValueError("guidance directory does not exist")
    documents = [load_document(path) for path in sorted(directory.glob("*.json"))]
    if not documents:
        raise ValueError("guidance directory has no documents")
    return documents


def load_builtin_documents() -> list[GuidanceDocument]:
    return load_documents(KNOWLEDGE_ROOT)
