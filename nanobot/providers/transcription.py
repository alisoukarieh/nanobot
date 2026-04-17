"""Voice transcription (STT) and synthesis (TTS) providers."""

import os
from pathlib import Path

import httpx
from loguru import logger

DEFAULT_TTS_VOICE = "Fritz-PlayAI"
DEFAULT_TTS_MODEL = "playai-tts"
DEFAULT_TTS_FORMAT = "mp3"


class OpenAITranscriptionProvider:
    """Voice transcription provider using OpenAI's Whisper API."""

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY")
        self.api_url = "https://api.openai.com/v1/audio/transcriptions"

    async def transcribe(self, file_path: str | Path) -> str:
        if not self.api_key:
            logger.warning("OpenAI API key not configured for transcription")
            return ""
        path = Path(file_path)
        if not path.exists():
            logger.error("Audio file not found: {}", file_path)
            return ""
        try:
            async with httpx.AsyncClient() as client:
                with open(path, "rb") as f:
                    files = {"file": (path.name, f), "model": (None, "whisper-1")}
                    headers = {"Authorization": f"Bearer {self.api_key}"}
                    response = await client.post(
                        self.api_url, headers=headers, files=files, timeout=60.0,
                    )
                    response.raise_for_status()
                    return response.json().get("text", "")
        except Exception as e:
            logger.error("OpenAI transcription error: {}", e)
            return ""


class GroqTranscriptionProvider:
    """
    Voice transcription provider using Groq's Whisper API.

    Groq offers extremely fast transcription with a generous free tier.
    """

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or os.environ.get("GROQ_API_KEY")
        self.api_url = "https://api.groq.com/openai/v1/audio/transcriptions"

    async def transcribe(self, file_path: str | Path) -> str:
        """
        Transcribe an audio file using Groq.

        Args:
            file_path: Path to the audio file.

        Returns:
            Transcribed text.
        """
        if not self.api_key:
            logger.warning("Groq API key not configured for transcription")
            return ""

        path = Path(file_path)
        if not path.exists():
            logger.error("Audio file not found: {}", file_path)
            return ""

        try:
            async with httpx.AsyncClient() as client:
                with open(path, "rb") as f:
                    files = {
                        "file": (path.name, f),
                        "model": (None, "whisper-large-v3"),
                    }
                    headers = {
                        "Authorization": f"Bearer {self.api_key}",
                    }

                    response = await client.post(
                        self.api_url,
                        headers=headers,
                        files=files,
                        timeout=60.0
                    )

                    response.raise_for_status()
                    data = response.json()
                    return data.get("text", "")

        except Exception as e:
            logger.error("Groq transcription error: {}", e)
            return ""


class GroqTtsProvider:
    """Text-to-speech via Groq's PlayAI TTS (OpenAI-compatible endpoint)."""

    MIME_BY_FORMAT = {
        "mp3": "audio/mpeg",
        "wav": "audio/wav",
        "flac": "audio/flac",
        "ogg": "audio/ogg",
        "opus": "audio/ogg; codecs=opus",
    }

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or os.environ.get("GROQ_API_KEY")
        self.api_url = "https://api.groq.com/openai/v1/audio/speech"

    async def synthesize(
        self,
        text: str,
        *,
        voice: str = DEFAULT_TTS_VOICE,
        model: str = DEFAULT_TTS_MODEL,
        fmt: str = DEFAULT_TTS_FORMAT,
    ) -> tuple[bytes, str] | None:
        """Generate audio bytes for `text`. Returns (bytes, mimetype) or None on failure."""
        if not self.api_key:
            logger.warning("Groq API key not configured for TTS")
            return None
        if not text.strip():
            return None
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    self.api_url,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": model,
                        "voice": voice,
                        "input": text,
                        "response_format": fmt,
                    },
                    timeout=60.0,
                )
                response.raise_for_status()
                return response.content, self.MIME_BY_FORMAT.get(fmt, "application/octet-stream")
        except Exception as e:
            logger.error("Groq TTS error: {}", e)
            return None
