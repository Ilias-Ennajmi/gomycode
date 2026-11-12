# Performance: the 1,000-image gate (SPEC section 8)

Gate: panning and zooming a 1,000-image board at 60 fps with p95 frame under 20 ms on a laptop-class machine; drag work under
16 ms per frame; decoded bitmaps under the memory budget (256 MiB on a desktop). Measured by `npm run bench` (see
`bench/README.md`): Chromium, CDP trace, p95 of the gaps between `DrawFrame` events.

## Method

- Board: `bench/fixtures/make-board.ts`, 1,000 images (180 to 420 canvas px) from 48 sources of 1,600 to 4,000 px made in the
  page and processed by the real upload pipeline (w256 / w1024 / w2048 + original). Every object has its own blob URL, so no
  two objects share a decoded bitmap.
- Scenarios (6 s each after a warm-up): `pan-fit` (every image in view, about 6.5 % zoom), `zoom-sweep` (fit to 400 % and
  back), `pan-100`, `drag-50` (50 images dragged).
- Machine: the development sandbox: 4 shared CPUs, **no GPU** (Chromium 153 rasterises with SwiftShader), other work running on
  the same machine. Desktop viewport 1440x900 at device pixel ratio 2; "phone" is 390x664 at 3.

## Caveat that matters

This is software rendering. Raster, image decode and WebGL fill all run on the CPU, so the absolute numbers say little about a
laptop or an iPad. What does carry over: work done on the main thread (JS, style, paint property trees, layerization) and the
shape of the curves. The numbers below are the sandbox's, the official ones are the local run on real hardware, to be recorded
here: `npm run bench` and `npm run bench -- --layer=webgl`.

## Results (p95 frame interval in ms; fps in brackets; three desktop runs, one phone run)

DOM image layer, after the optimisations below:

| scenario | desktop @2x runs 1 / 2 / 3 | desktop @1x | phone @3x | gate |
|---|---|---|---|---|
| pan-fit | 17.2 / 16.8 / 16.8 (60) | 16.8 (60) | 16.9 (60) | pass |
| zoom-sweep | 47.1 / 53.4 / 46.7 (45) | 46.5 (50) | 50.0 (48) | **fail** |
| pan-100 | 19.2 / 16.8 / 17.2 (60) | 17.1 (60) | 17.6 (60) | pass |
| drag-50 | 34.5 / 33.7 / 33.5 (53) | 33.9 (52) | 33.7 (53) | **fail** (two vsync steps) |

Work per pointer move while dragging 50 images (JS, `handlerP95`): 1.9 ms, max 7 ms: well under the 16 ms budget. Decoded
bitmaps peaked at 254 MiB (budget 256 MiB, the gate allows +10 %).

Before the optimisations (first run of the DOM layer as first built): `pan-fit` 20 fps, p95 62 ms; `zoom-sweep` and `pan-100`
about as now; `drag-50` p95 33 ms. Phase 1's own baseline for the same kind of board (1,000 placeholders, zoom only):
17 to 20 fps.

WebGL image layer (`/bench?layer=webgl`, PixiJS 8 on SwiftShader):

| scenario | desktop @2x | desktop @1x |
|---|---|---|
| pan-fit | 72.6 (16 fps) | 32.1 (38 fps) |
| zoom-sweep | 96.2 (13 fps) | 66.4 (39 fps) |
| pan-100 | 86.0 (14 fps) | 27.9 (53 fps) |
| drag-50 | 78.2 (16 fps) | 29.5 (50 fps) |

## What the optimisations were, and what the measurements said

1. **Promoting the camera layer (`will-change: transform`) was the largest cost, not a saving.** With 1,000 images mounted,
   panning with the layer promoted ran at 20 fps (layerization of the composited group took about 50 ms a frame); with it off:
   60 fps. Promotion is now used only while at most 300 images are mounted, and a long gesture no longer drops and re-takes it
   every 300 ms (that cost 150 to 250 ms a time).
2. **Minimal DOM per image**: `left`/`top` instead of a transform, no `overflow`/`contain`, no extra wrapper positioning;
   a transform only for a rotated image, a clip only for a cropped or masked one. Each transform, clip or stacking context is a
   paint property node or chunk whose per-frame bookkeeping, not the pixels, costs frames.
3. Images swap variants only after the camera settles; a gesture never swaps a tier for another (`setGesture`).
4. Items that left the view are released at once (the bitmap is freed); the LRU residency budget demotes the rest.
5. Tried and rejected by measurement: `contain: layout paint style` and `content-visibility` on each image (slower), always-on
   `will-change`, `translate3d`.

## Decision

See `docs/decisions/0001-image-layer.md`. In short: `DomImageLayer` stays the default (it passes both pan scenarios at 60 fps
with 1,000 images mounted, and drag work is 2 ms). `zoom-sweep` and the frame gaps of `drag-50` fail in the sandbox: the time goes
into CPU raster and image decode of hundreds of images arriving at once, which a GPU removes, and the main thread is idle
for most of it. The WebGL layer was built as the plan's fallback and is **slower** here (SwiftShader fills 5 million pixels per
frame on the CPU), so it is not the default and the sandbox cannot say whether it would win on a GPU. The gate is therefore
**not proven on real hardware**: run both layers there and record the numbers in this file before Phase 2 is called done.
