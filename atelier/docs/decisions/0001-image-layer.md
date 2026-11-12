# ADR 0001: how images are drawn

Status: accepted for Phase 2, pending a run on real hardware (see Consequences).

## Context

SPEC section 8 asks for 60 fps and a p95 frame under 20 ms panning and zooming 1,000 images. Phase 1 drew images as React
nodes and measured 17 to 20 fps zooming 1,000 image placeholders in a software-rendered sandbox. Phase 2 moved images behind
the `ImageLayer` interface (`lib/engine/render/image-layer.ts`) so the renderer could change without touching the canvas.

## Options

1. `DomImageLayer`: a keyed pool of `<img>` elements inside the camera layer. Shares stacking with every other object (a
   shape can sit between two images, an image inside a frame stays above the frame), selection, hit-testing and credits
   captions work unchanged. Cost: browser raster and decode per image, layerization per element.
2. `WebGLImageLayer` (PixiJS 8, MIT, lazy-loaded): one canvas, one sprite per image, textures from `ImageBitmap`, LRU
   `TextureCache`. Cost: a GPU context (lost on mobile, memory), objects between two images render above both (one canvas has
   one z), captions are a DOM overlay.

## Measurements (details and method: `docs/PERF.md`)

Software-rendered Chromium 153, 1,000 images, desktop 1440x900 @2x: DOM layer pan-fit p95 17 ms, pan-100 17 to 19 ms (both
60 fps), zoom-sweep 47 to 53 ms, drag-50 34 ms (drag work 1.9 ms per move). WebGL layer: 28 to 96 ms in every scenario (13 to
53 fps): SwiftShader fills the canvas on the CPU.

The first DOM build did 20 fps on pan-fit. Cause found by tracing: `will-change: transform` on the camera layer with many images
(layerization 50 ms a frame) and its drop and re-take every 300 ms during long gestures. Fixed (promotion only up to 300 mounted
images, kept for the whole gesture) together with a minimal per-image DOM; both are in `PERF.md`.

## Decision

- `DomImageLayer` is the default.
- `WebGLImageLayer` is built and tested (`createImageLayer({ preferWebGL: true })`, `CanvasView`'s `preferWebGL` prop,
  `/bench?layer=webgl`), falls back to the DOM layer if WebGL is missing or the context is lost and not restored in 3 s, and is
  off by default because it did not win anywhere it could be measured and has the z-order limitation above.
- A board with one image between two non-image objects, or any frame with images inside, must keep the DOM layer.

## Consequences

- The gate is met for panning, and drag work, in the sandbox; zoom-sweep and drag frame gaps are not, and the cause is CPU
  raster/decode that the sandbox cannot separate from the app. It is not shown to pass or fail on a GPU.
- Before Phase 2 ships: run `npm run bench` and `npm run bench -- --layer=webgl` on a laptop and an iPad-class device, record
  the numbers in `docs/PERF.md`; if the DOM layer's zoom-sweep still fails there, make WebGL the default for boards above a
  few hundred images (a one-line change where `CanvasView` is given `preferWebGL`) and accept the z-order limitation for those
  boards.
