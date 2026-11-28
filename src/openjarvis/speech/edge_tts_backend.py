"""Microsoft Edge neural TTS backend — free, no API key.

Uses the ``edge-tts`` package, which talks to the same online neural voices
that Edge's "Read aloud" uses. Good Korean male voices
(``ko-KR-InJoonNeural``, ``ko-KR-HyunsuMultilingualNeural``) with no account
and no cost. Needs internet access; the text being spoken is sent to
Microsoft's service.

Install: ``pip install edge-tts`` (or the ``voice-edge`` extra).
"""

from __future__ import annotations

import asyncio
import os
from typing import List

from openjarvis.core.registry import TTSRegistry
from openjarvis.speech.tts import TTSBackend, TTSResult

DEFAULT_VOICE = "ko-KR-InJoonNeural"
# Stock pitch. Override with EDGE_TTS_PITCH, e.g. "-6Hz" for a lower, calmer tone.
DEFAULT_PITCH = "+0Hz"

_VOICES = [
    "ko-KR-InJoonNeural",
    "ko-KR-HyunsuMultilingualNeural",
    "ko-KR-SunHiNeural",
    "en-GB-RyanNeural",
    "en-GB-ThomasNeural",
]


def _rate_from_speed(speed: float) -> str:
    """edge-tts takes a signed percentage: speed 0.95 → "-5%"."""
    pct = round((speed - 1.0) * 100)
    return f"{pct:+d}%"


def _looks_like_edge_voice(voice_id: str) -> bool:
    # Edge voice IDs look like "ko-KR-InJoonNeural"; anything else (Kokoro's
    # "bm_george", an ElevenLabs hash) belongs to another backend.
    return voice_id.count("-") >= 2 and voice_id.endswith("Neural")


async def _synthesize(text: str, voice: str, rate: str, pitch: str) -> bytes:
    import edge_tts

    communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
    chunks: list[bytes] = []
    async for chunk in communicate.stream():
        if chunk.get("type") == "audio" and chunk.get("data"):
            chunks.append(chunk["data"])
    if not chunks:
        raise RuntimeError("edge-tts returned no audio")
    return b"".join(chunks)


@TTSRegistry.register("edge_tts")
class EdgeTTSBackend(TTSBackend):
    """Free Microsoft Edge neural voices."""

    backend_id = "edge_tts"

    def __init__(self, *, pitch: str = "") -> None:
        self._pitch = pitch or os.environ.get("EDGE_TTS_PITCH", DEFAULT_PITCH)

    def synthesize(
        self,
        text: str,
        *,
        voice_id: str = "",
        speed: float = 1.0,
        output_format: str = "mp3",
    ) -> TTSResult:
        voice = voice_id if _looks_like_edge_voice(voice_id) else DEFAULT_VOICE
        # Called from a worker thread (asyncio.to_thread), so there is no
        # running loop here and asyncio.run is safe.
        audio = asyncio.run(
            _synthesize(text, voice, _rate_from_speed(speed), self._pitch)
        )
        return TTSResult(
            audio=audio,
            format="mp3",  # edge-tts always streams MP3
            voice_id=voice,
            metadata={"backend": "edge_tts", "pitch": self._pitch},
        )

    def available_voices(self) -> List[str]:
        return list(_VOICES)

    def health(self) -> bool:
        try:
            import edge_tts  # noqa: F401
        except ImportError:
            return False
        return True


__all__ = ["EdgeTTSBackend"]
