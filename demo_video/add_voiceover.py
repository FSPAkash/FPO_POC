from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path

import imageio_ffmpeg
import pythoncom
import win32com.client
from openai import OpenAI


ROOT = Path(__file__).resolve().parent
DECK_PATH = ROOT / "FPO_Integrated_OS_Walkthrough.pptx"
VIDEO_PATH = ROOT / "FPO_Integrated_OS_Walkthrough.mp4"
AUDIO_DIR = ROOT / "voiceover"
SILENT_VIDEO_PATH = ROOT / "_silent_export.mp4"
MUXED_VIDEO_PATH = ROOT / "_muxed_export.mp4"
FULL_AUDIO_PATH = AUDIO_DIR / "full_voiceover.m4a"
PAUSE_AUDIO_PATH = AUDIO_DIR / "_pause.mp3"
CONCAT_LIST_PATH = AUDIO_DIR / "_concat.txt"

OPENAI_MODEL = "gpt-4o-mini-tts"
OPENAI_VOICE = "cedar"
OPENAI_SPEED = 0.97
OPENAI_INSTRUCTIONS = (
    "Narrate like a real human product presenter in natural American English. "
    "Sound warm, confident, clear, and conversational. "
    "Keep a medium speaking pace with light emphasis on key phrases and short natural pauses. "
    "Avoid exaggerated announcer energy and avoid sounding robotic."
)

PAUSE_AFTER_SLIDE_SECONDS = 0.65
FRAME_RATE = 12
VERTICAL_RESOLUTION = 720
VIDEO_QUALITY = 85

BRAND_TEXT = {
    "FPO Integrated OS",
    "POWERED BY FINDABILITY SCIENCES",
}

MSO_FALSE = 0
MSO_TRUE = -1
MSO_MEDIA = 16
PP_VIDEO_STATUS_DONE = 3
PP_VIDEO_STATUS_FAILED = 4


def clean_text(value: str) -> str:
    return " ".join(str(value).replace("\r", " ").replace("\n", " ").split())


def join_narration_parts(parts: list[str]) -> str:
    normalized = [part.strip() for part in parts if part and part.strip()]
    if not normalized:
        return ""

    combined: list[str] = []
    for part in normalized:
        if combined and combined[-1][-1] not in ".?!:":
            combined[-1] += "."
        combined.append(part)
    return " ".join(combined)


def with_powerpoint(action):
    pythoncom.CoInitialize()
    power_point = None
    presentation = None
    try:
        power_point = win32com.client.Dispatch("PowerPoint.Application")
        power_point.Visible = 1
        presentation = power_point.Presentations.Open(str(DECK_PATH), MSO_FALSE, MSO_FALSE, MSO_FALSE)
        return action(presentation)
    finally:
        if presentation is not None:
            presentation.Close()
        if power_point is not None:
            power_point.Quit()
        pythoncom.CoUninitialize()


def narration_texts(presentation) -> list[str]:
    texts: list[str] = []
    for slide_index in range(1, presentation.Slides.Count + 1):
        slide = presentation.Slides.Item(slide_index)
        candidates: list[tuple[float, float, str]] = []
        for shape_index in range(1, slide.Shapes.Count + 1):
            shape = slide.Shapes.Item(shape_index)
            try:
                if not shape.HasTextFrame:
                    continue
                if not shape.TextFrame.HasText:
                    continue
                text = clean_text(shape.TextFrame.TextRange.Text)
            except Exception:
                continue
            if not text or text in BRAND_TEXT:
                continue
            candidates.append((float(shape.Height), float(shape.Top), text))

        top_two = sorted(candidates, key=lambda item: (item[0], len(item[2])), reverse=True)[:2]
        top_two.sort(key=lambda item: item[1])
        narration = join_narration_parts([item[2] for item in top_two])
        if not narration:
            raise RuntimeError(f"Could not derive narration text for slide {slide_index}.")
        texts.append(narration)
    return texts


def load_slide_texts() -> list[str]:
    return with_powerpoint(narration_texts)


def media_duration_seconds(path: Path) -> float:
    player = win32com.client.Dispatch("WMPlayer.OCX.7")
    media = player.newMedia(str(path))
    duration = float(media.duration or 0.0)
    if duration <= 0:
        raise RuntimeError(f"Could not read duration for {path.name}.")
    return duration


def clear_existing_voiceover_files() -> None:
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    for pattern in ("slide-*.mp3", "slide-*.wav", "slide-*.aac"):
        for path in AUDIO_DIR.glob(pattern):
            path.unlink()
    for path in (FULL_AUDIO_PATH, PAUSE_AUDIO_PATH, CONCAT_LIST_PATH):
        if path.exists():
            path.unlink()


def synthesize_voiceover(slide_texts: list[str]) -> list[Path]:
    clear_existing_voiceover_files()
    client = OpenAI()
    audio_paths: list[Path] = []

    for index, text in enumerate(slide_texts, start=1):
        audio_path = AUDIO_DIR / f"slide-{index:02d}.mp3"
        with client.audio.speech.with_streaming_response.create(
            model=OPENAI_MODEL,
            voice=OPENAI_VOICE,
            input=text,
            instructions=OPENAI_INSTRUCTIONS,
            response_format="mp3",
            speed=OPENAI_SPEED,
        ) as response:
            response.stream_to_file(audio_path)
        audio_paths.append(audio_path)

    return audio_paths


def fix_title_pills(presentation) -> None:
    for slide_index in (1, presentation.Slides.Count):
        slide = presentation.Slides.Item(slide_index)
        pill = None
        pill_text = None
        for shape_index in range(1, slide.Shapes.Count + 1):
            shape = slide.Shapes.Item(shape_index)
            try:
                if (
                    shape.Type == 1
                    and shape.AutoShapeType == 5
                    and abs(float(shape.Width) - 200.0) < 1.0
                    and abs(float(shape.Height) - 26.0) < 1.0
                ):
                    pill = shape
            except Exception:
                pass
            try:
                if shape.HasTextFrame and shape.TextFrame.HasText:
                    text = clean_text(shape.TextFrame.TextRange.Text)
                    if text.isupper() and float(shape.Height) < 14 and float(shape.Top) > 140:
                        pill_text = shape
            except Exception:
                pass

        if pill is None or pill_text is None:
            continue

        pill_text.Top = float(pill.Top) + ((float(pill.Height) - float(pill_text.Height)) / 2.0)


def remove_existing_media(slide) -> None:
    for shape_index in range(slide.Shapes.Count, 0, -1):
        shape = slide.Shapes.Item(shape_index)
        try:
            if shape.Type == MSO_MEDIA:
                shape.Delete()
        except Exception:
            continue


def set_slide_timing(slide, seconds: float) -> None:
    transition = slide.SlideShowTransition
    transition.AdvanceOnClick = MSO_FALSE
    transition.AdvanceOnTime = MSO_TRUE
    transition.AdvanceTime = seconds
    transition.EntryEffect = 0
    transition.Duration = 0


def export_timed_video(audio_paths: list[Path]) -> None:
    if SILENT_VIDEO_PATH.exists():
        SILENT_VIDEO_PATH.unlink()

    def _export(presentation):
        slide_texts = narration_texts(presentation)
        if len(slide_texts) != len(audio_paths):
            raise RuntimeError("Slide text count does not match generated audio count.")

        fix_title_pills(presentation)

        for slide_index, audio_path in enumerate(audio_paths, start=1):
            slide = presentation.Slides.Item(slide_index)
            remove_existing_media(slide)
            duration_seconds = media_duration_seconds(audio_path) + PAUSE_AFTER_SLIDE_SECONDS
            set_slide_timing(slide, round(duration_seconds, 2))

        presentation.Save()
        presentation.CreateVideo(str(SILENT_VIDEO_PATH), True, 5, VERTICAL_RESOLUTION, FRAME_RATE, VIDEO_QUALITY)

        deadline = time.time() + (20 * 60)
        while time.time() < deadline:
            status = int(presentation.CreateVideoStatus)
            if status == PP_VIDEO_STATUS_DONE:
                break
            if status == PP_VIDEO_STATUS_FAILED:
                raise RuntimeError("PowerPoint video export failed.")
            time.sleep(3)

        if not SILENT_VIDEO_PATH.exists():
            raise RuntimeError("PowerPoint video export did not produce an MP4 file.")

    with_powerpoint(_export)


def run_ffmpeg(*args: str) -> None:
    command = [imageio_ffmpeg.get_ffmpeg_exe(), *map(str, args)]
    completed = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or "ffmpeg failed.")


def create_pause_audio() -> None:
    run_ffmpeg(
        "-y",
        "-f",
        "lavfi",
        "-i",
        "anullsrc=r=24000:cl=mono",
        "-t",
        f"{PAUSE_AFTER_SLIDE_SECONDS:.2f}",
        "-c:a",
        "mp3",
        "-q:a",
        "2",
        str(PAUSE_AUDIO_PATH),
    )


def build_combined_audio(audio_paths: list[Path]) -> Path:
    create_pause_audio()
    lines: list[str] = []
    for audio_path in audio_paths:
        lines.append(f"file '{audio_path.resolve().as_posix()}'")
        lines.append(f"file '{PAUSE_AUDIO_PATH.resolve().as_posix()}'")
    CONCAT_LIST_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")

    run_ffmpeg(
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        str(CONCAT_LIST_PATH),
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        str(FULL_AUDIO_PATH),
    )
    return FULL_AUDIO_PATH


def mux_audio_into_video(audio_path: Path) -> None:
    if MUXED_VIDEO_PATH.exists():
        MUXED_VIDEO_PATH.unlink()

    run_ffmpeg(
        "-y",
        "-i",
        str(SILENT_VIDEO_PATH),
        "-i",
        str(audio_path),
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-movflags",
        "+faststart",
        "-shortest",
        str(MUXED_VIDEO_PATH),
    )

    if VIDEO_PATH.exists():
        VIDEO_PATH.unlink()
    MUXED_VIDEO_PATH.replace(VIDEO_PATH)

    if SILENT_VIDEO_PATH.exists():
        SILENT_VIDEO_PATH.unlink()
    if PAUSE_AUDIO_PATH.exists():
        PAUSE_AUDIO_PATH.unlink()
    if CONCAT_LIST_PATH.exists():
        CONCAT_LIST_PATH.unlink()


def main() -> int:
    if not DECK_PATH.exists():
        raise FileNotFoundError(f"Missing deck: {DECK_PATH}")

    slide_texts = load_slide_texts()
    audio_paths = synthesize_voiceover(slide_texts)
    export_timed_video(audio_paths)
    full_audio_path = build_combined_audio(audio_paths)
    mux_audio_into_video(full_audio_path)

    for index, audio_path in enumerate(audio_paths, start=1):
        print(f"slide {index:02d}: {audio_path.name} ({media_duration_seconds(audio_path):.2f}s)")
    print(f"combined audio: {full_audio_path}")
    print(f"updated deck: {DECK_PATH}")
    print(f"updated video: {VIDEO_PATH}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(130)
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1)
