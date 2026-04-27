# Demo Video Playbook

This playbook is for creating a polished walkthrough video for any software project, even when the next project has a different stack, UI, or folder layout.

## Goal

Produce a clean demo package with:

- a final `.mp4`
- a source slide deck or scene file
- a narration script
- reusable audio assets
- a rebuild script

## Core Principle

Treat the video as a build artifact, not a one-off manual export.

That means:

- the story is written down
- screenshots or recordings are reproducible
- audio is generated from a script
- timing is derived from the audio
- the final `.mp4` can be rebuilt without redoing everything by hand

## Recommended Folder Structure

```text
demo_video/
  screenshots/
  voiceover/
  exports/
  DEMO_VIDEO_SCRIPT.md
  build_slides.ps1
  add_voiceover.py
  final_walkthrough.pptx
  final_walkthrough.mp4
```

Use different file names if needed, but keep the separation between captures, audio, source assets, and exports.

## Workflow

### 1. Lock the story first

Define:

- who the video is for
- the runtime target
- the sections to show
- the one-sentence takeaway for each section

If the story is not clear, the video will feel long even when it is short.

### 2. Freeze the demo state

Before capturing anything:

- reset or seed the demo data
- remove sensitive or distracting records
- decide which overlays should be visible
- make sure intro and outro styling matches the product aesthetic

Never capture before the data and UI are presentation-ready.

### 3. Capture visuals in a repeatable way

Preferred order:

1. scripted route-based screenshots
2. deterministic UI state toggles
3. manual capture only as a fallback

Good capture rules:

- use a consistent viewport
- avoid transient toasts, cursors, and random timestamps when possible
- capture the exact state the narration refers to
- save captures with ordered names like `01-home.png`, `02-queue.png`

### 4. Build the visual track

Use slides or scene cards to assemble:

- intro slide
- one slide per product section
- closing slide

Design rules:

- intro and outro should match the app, not a generic dark template
- text pills, badges, and headers should be geometrically centered, not eyeballed
- keep screenshot framing consistent
- use short labels and one strong headline per slide

### 5. Write narration from the slide story

The narration should explain what the viewer is seeing, not duplicate every word on screen.

For each slide, write:

- the purpose of the screen
- the action or value being demonstrated
- the transition to the next step

Medium-speed narration usually lands best for product walkthroughs.

## Voiceover Guidance

### OpenAI TTS approach

Use OpenAI text-to-speech when you want a more natural voice than local system TTS.

Recommended pattern:

- generate one audio file per slide
- use instructions to control tone, pace, and accent
- keep the voice style consistent across all slides
- preserve the per-slide files and also create one combined track

Useful style prompt:

```text
Narrate like a real human product presenter in natural American English.
Sound warm, confident, clear, and conversational.
Keep a medium speaking pace with light emphasis on key phrases and short natural pauses.
Avoid exaggerated announcer energy and avoid sounding robotic.
```

Important:

- disclose that the voice is AI-generated if the audience should be told
- verify the currently supported OpenAI speech model and voices before reuse

### Timing rule

Do not force the voice to match preselected slide durations.

Instead:

- generate the audio first
- measure each clip length
- set each slide duration from the clip length
- add a short pause between slides

This produces more natural pacing.

## Final Assembly Rule

Do not rely on slide-embedded audio surviving the final video export.

Safer pattern:

1. export a timed silent video from the slide deck
2. concatenate the per-slide narration clips into one full track
3. mux the final audio track into the `.mp4` with `ffmpeg`

Example mux pattern:

```bash
ffmpeg -i silent.mp4 -i full_voiceover.m4a \
  -map 0:v:0 -map 1:a:0 \
  -c:v copy -c:a aac -b:a 192k \
  -movflags +faststart -shortest final.mp4
```

This is more reliable than trusting a presentation app to export audio correctly.

## QA Checklist

Before signoff, verify:

- the final `.mp4` has a real audio stream
- the audio actually plays in a normal video player
- runtime feels intentional
- slide text matches narration
- intro and outro match the product look
- no sensitive data appears
- no hidden media icons or slide artifacts are visible
- pills, labels, and small badges are vertically centered

## Common Failure Modes

- screenshots were captured before the demo state was cleaned
- voiceover sounds robotic because local TTS was used without style control
- slide timings are too short because they were chosen before audio generation
- PowerPoint or another slide tool exports a silent video even though the deck plays audio
- intro and outro use a theme that clashes with the app
- small UI details like pills or chips look off because text was positioned manually

## What To Save Every Time

For every project, keep:

- the final `.mp4`
- the source deck
- the narration script
- the per-slide audio files
- the combined audio file
- the rebuild script
- the screenshot source set

That turns one successful walkthrough into a reusable production workflow.
