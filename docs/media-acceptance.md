# Media acceptance

Open Translate's media contract retains the recommended differences from the historical original comparison: stopping restores native subtitles and clears the extension overlay. Its interface and acceptance criteria are its own. Historical `docs/parity/media-results.json` records an older original comparison; it is not current feature acceptance.

Run a stable build followed by `node scripts/acceptance-media.mjs`. The runner verifies the Chrome source/bundle stamp before and after testing, runs the focused Node tests and actual Chromium extension tests, and writes `docs/acceptance/media.json`. Raw test results and exported PNGs remain under ignored `dist/acceptance/media`. The report binds the tested source, build, test inputs, fixture models and exported image hashes. A changed source or bundle requires a new run.

| Area | Acceptance evidence |
| --- | --- |
| OCR languages | Real Simplified Chinese, Japanese, mixed English/Chinese and French recognition. French data is validated before initialization and reused from offline profile cache. CJK segmentation separators are normalized without changing Latin word spaces, Korean spaces or line breaks. |
| Image exports | Downloaded PNG signatures and dimensions; colored background retained; detailed pixels outside text regions unchanged. A Chinese fixture rejects residual original strokes below the replacement text. Exported Chinese/Japanese/mixed PNGs are available for visual review. |
| Audio transport | Real AudioWorklet capture produces independent mono 16-kHz PCM WAVs in configured two-second segments. VAD uploads no idle silence, preserves speech preroll and finishes at pauses. Unit checks cover fractional resampling and sample-derived timestamps. |
| Audio lifecycle | Declined permissions, late grants after cancellation, missing audio, failed device setup, browser-ended events, repeated starts, stop flushing and cancellation. Granted tracks stop, listeners detach, audio nodes disconnect, contexts close and pending results are discarded on cancellation. |
| Queue pressure | Four-segment limit stops capture with a visible status; bounded queued work drains without recursively flushing into a full queue. A session cannot restart while its previous speech work is pending. |
| Native captions | Overlapping multiline Arabic cues retain their content and right-to-left direction. Track reselection hides duplicate native captions; stop restores the selected track. Repeated toggles and player-container fullscreen preserve the bilingual overlay. |
| DOM and supplied captions | Dynamic open shadow-root captions are discovered and translated. Supplied subtitle sidecars retain start/end times. Hidden/aria-hidden DOM captions are ignored. |
| Screen OCR | Explicit sharing; top/bottom/full/custom regions persist. Letterbox bars cannot start a selection; normalized regions map to the decoded frame and survive preview resizing. One failed translation can retry the same unchanged caption. Stop and ended events release tracks and discard stale OCR/translation results. |

## What this evidence does not establish

The tests supply synthetic streams and controlled permission failures/ended events. They exercise actual browser media, OCR, canvas, download, native-track and extension messaging APIs, but do not automate an operating-system sharing picker, physical microphone or protected playback. Speech replies come from a deterministic local endpoint; transcription model accuracy, AGY translation quality and endpoint latency require their separate acceptance results.

Image reconstruction is local harmonic interpolation, with glyph masks derived from OCR line bounds. It does not guarantee detailed texture hidden by a glyph, artistic lettering, exact typography or detection of every glyph. The exported synthetic images exercise colored backgrounds and detailed unmodified areas, not arbitrary photographic or illustrated material. Selected real language fixtures do not measure all 124 model packs.

Native captions use a local original VP8 video and standard text tracks. Fullscreen acceptance covers a player container; browser-only fullscreen video controls, closed player internals, commercial player APIs, encrypted streams and DRM capture remain outside this evidence. Browser capture restrictions are respected.

API behavior follows [Media Capture and Streams](https://www.w3.org/TR/mediacapture-streams/) and [CSS object fitting](https://www.w3.org/TR/css-images-3/#the-object-fit). Track `.stop()` does not itself emit `ended`; tests distinguish an explicit stop from a simulated browser-ended event.
