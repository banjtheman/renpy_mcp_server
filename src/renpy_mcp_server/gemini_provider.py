"""Shared helpers for interacting with the Google Gemini API."""

from __future__ import annotations

from functools import lru_cache
from typing import Optional

from google import genai


class GeminiProviderError(RuntimeError):
    """Raised when the Gemini client cannot be initialized."""


@lru_cache(maxsize=1)
def get_gemini_client(api_key: Optional[str]) -> genai.Client:
    """Return a cached Gemini client for the given API key."""
    if not api_key:
        raise GeminiProviderError(
            "GEMINI_API_KEY is not configured. Set the environment variable or update settings."
        )
    return genai.Client(api_key=api_key)
