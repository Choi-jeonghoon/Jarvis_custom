"""Tests for the free Microsoft Edge TTS backend (network mocked)."""

from __future__ import annotations

import sys
import types

import pytest

from openjarvis.speech import edge_tts_backend as mod


class _FakeCommunicate:
    calls: list[dict] = []

    def __init__(self, text, voice, *, rate, pitch):
        _FakeCommunicate.calls.append(
            {"text": text, "voice": voice, "rate": rate, "pitch": pitch}
        )

    async def stream(self):
        yield {"type": "WordBoundary"}
        yield {"type": "audio", "data": b"ab"}
        yield {"type": "audio", "data": b"cd"}


@pytest.fixture
def fake_edge(monkeypatch):
    _FakeCommunicate.calls = []
    monkeypatch.setitem(
        sys.modules, "edge_tts", types.SimpleNamespace(Communicate=_FakeCommunicate)
    )
    monkeypatch.delenv("EDGE_TTS_PITCH", raising=False)
    return _FakeCommunicate


def test_synthesize_joins_audio_chunks(fake_edge):
    result = mod.EdgeTTSBackend().synthesize("안녕", voice_id="ko-KR-InJoonNeural")
    assert result.audio == b"abcd"
    assert result.format == "mp3"
    assert fake_edge.calls[0]["voice"] == "ko-KR-InJoonNeural"
    assert fake_edge.calls[0]["pitch"] == mod.DEFAULT_PITCH


@pytest.mark.parametrize(
    ("speed", "rate"), [(1.0, "+0%"), (0.95, "-5%"), (1.2, "+20%")]
)
def test_speed_maps_to_signed_rate(fake_edge, speed, rate):
    mod.EdgeTTSBackend().synthesize("x", speed=speed)
    assert fake_edge.calls[0]["rate"] == rate


@pytest.mark.parametrize("foreign", ["bm_george", "JBFqnCBsd6RMkjVDRZzb", ""])
def test_other_backends_voice_ids_fall_back_to_default(fake_edge, foreign):
    result = mod.EdgeTTSBackend().synthesize("x", voice_id=foreign)
    assert result.voice_id == mod.DEFAULT_VOICE


def test_pitch_env_override(fake_edge, monkeypatch):
    monkeypatch.setenv("EDGE_TTS_PITCH", "-6Hz")
    mod.EdgeTTSBackend().synthesize("x")
    assert fake_edge.calls[0]["pitch"] == "-6Hz"


def test_empty_stream_raises(monkeypatch):
    class Silent(_FakeCommunicate):
        async def stream(self):
            if False:
                yield {}

    monkeypatch.setitem(
        sys.modules, "edge_tts", types.SimpleNamespace(Communicate=Silent)
    )
    with pytest.raises(RuntimeError):
        mod.EdgeTTSBackend().synthesize("x")


def test_registered_and_in_discovery_order():
    from openjarvis.core.registry import TTSRegistry
    from openjarvis.speech._tts_discovery import TTS_BACKEND_ORDER, default_voice_for

    # conftest clears registries between tests; re-register like the other
    # backend tests do.
    TTSRegistry.register_value("edge_tts", mod.EdgeTTSBackend)
    assert TTSRegistry.contains("edge_tts")
    assert "edge_tts" in TTS_BACKEND_ORDER
    assert default_voice_for("edge_tts") == "ko-KR-InJoonNeural"
