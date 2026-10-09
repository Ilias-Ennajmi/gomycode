"""ffmpeg steps on a tiny generated clip (skipped when ffmpeg isn't installed)."""

import shutil
import subprocess

import pytest

from stash_worker import media

pytestmark = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")


@pytest.fixture()
def clip(tmp_path):
    src = tmp_path / "in.mp4"
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error",
         "-f", "lavfi", "-i", "testsrc=size=1080x1920:rate=30:duration=2",
         "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
         "-shortest", "-c:v", "libx264", "-c:a", "aac", str(src)],
        check=True,
    )
    return src


def test_transcode_makes_720p_portrait(clip, tmp_path):
    out = tmp_path / "out.mp4"
    media.transcode(clip, out)
    dims = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
         "-of", "csv=p=0", str(out)], check=True, capture_output=True, text=True,
    ).stdout.strip()
    assert dims == "720,1280"
    info = media.probe(out)
    assert info["has_audio"] and info["has_video"] and info["duration"] > 1.5


def test_thumbnail_and_audio(clip, tmp_path):
    thumb, audio = tmp_path / "t.jpg", tmp_path / "a.mp3"
    media.thumbnail(clip, thumb)
    media.audio_for_transcription(clip, audio)
    assert thumb.stat().st_size > 1000
    assert audio.stat().st_size > 1000
