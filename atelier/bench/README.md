# Bench: the 1,000-image gate

SPEC section 8: panning and zooming a 1,000-image board must hold 60 fps with a p95 frame under 20 ms on a laptop-class
machine, drag work stays under 16 ms per frame, and decoded bitmaps stay under the memory budget.

## Run it

```
npm run build
ATELIER_LOCAL_ONLY=1 ATELIER_BENCH=1 PORT=3300 npm start        # in one terminal
BENCH_URL=http://localhost:3300 npm run bench                   # in another
```

`/bench` is a 404 unless the server has `ATELIER_BENCH=1` (and never on Vercel production). It builds the board of
`bench/fixtures/make-board.ts` (1,000 objects, 48 source images of 1,600 to 4,000 px made in the page and pushed through the
real upload pipeline, one blob URL per object so no two objects share a decoded bitmap) and exposes `window.__bench`.

`bench/run.ts` opens it in Chromium (1440x900, device pixel ratio 2) and runs four scenarios, each after a warm-up pass of
the same motion and each recorded with a CDP trace (`DrawFrame` events, reduced by `bench/stats.ts`):

| scenario | what moves |
|---|---|
| `pan-fit` | two-finger pan with every image in view (fit-all, about 6 % zoom) |
| `zoom-sweep` | ctrl+wheel zoom from fit-all to about 400 % and back |
| `pan-100` | diagonal pan at 100 % |
| `drag-50` | a selection of 50 images dragged; the work per pointer move is recorded too |

Flags: `--dpr=N`, `--viewport=WxH`, `--only=name`, `--seconds=N`, `--ci` (thresholds times `BENCH_CI_FACTOR`, default 2).
Results go to `bench/results/latest.json` (and a timestamped copy; both git-ignored). Exit code 1 means the gate failed.

## Reading the numbers

Numbers are only comparable on the same machine, browser and load. A sandbox or CI runner has no GPU: it rasterises on the
CPU (SwiftShader), and every other process on the machine shows up in the frame times. Treat a CI result as a smoke test and
the local run on real hardware as the benchmark. The numbers recorded so far, with the method and the caveats, are in
`docs/PERF.md`; the decision they led to is `docs/decisions/0001-image-layer.md`.
