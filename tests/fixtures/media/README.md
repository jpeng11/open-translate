# Native video clock

`clock.webm` is an original, silent 640×360 VP8 video containing approximately 20 seconds of a solid `#222` frame at five frames per second. It supplies a real video timeline for local VTT caption comparisons; it contains no third-party images, audio or captions. The repository's MIT license applies.

Generated in Chromium 156 with a canvas capture stream and `MediaRecorder({mimeType:'video/webm;codecs=vp8'})`, drawing every 200 ms and stopping after 20,050 ms. The comparison server supports byte ranges so Chromium can seek across cue boundaries. The comparison sets playback to 0.1× while sampling captions, giving both extensions time to observe trusted native `cuechange` and `timeupdate` events.

Caption text and French fixture translations are defined in `scripts/reference-media.mjs`. This video tests timing and observable rendering; it establishes no production-player access or speech-recognition accuracy.
