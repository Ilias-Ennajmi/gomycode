# Dependencies added after Phase 1

Every runtime dependency must be MIT, Apache-2.0, ISC, BSD or OFL (see `CLAUDE.md`). One line per addition: licence, size, why.

## hash-wasm 4.13.0 (Phase 3, share-link passwords)

- Licence: MIT (checked in `node_modules/hash-wasm/package.json` and the lockfile).
- Size: the argon2 module is about 32 KB minified (WASM embedded as base64 in the JS, so no separate file and no native binary).
  Server only: it is imported from `lib/share/password.ts`, never from `app/s/**` or `components/viewer/**`.
- Why: argon2id is the first algorithm SPEC section 5 names. It was chosen over `argon2` / `@node-rs/argon2` (native binaries that
  can break a Vercel build) and over `bcryptjs` (weaker against GPUs, 72-byte input limit). Runs unchanged in the Node runtime
  on Vercel and in Vitest.
- Parameters and measurements (4-core x86, Node 22, median of 7 runs, one hash):

  | memory | iterations | parallelism | time |
  |---|---|---|---|
  | 19 MiB (OWASP floor) | 2 | 1 | 49 ms |
  | 32 MiB | 2 | 1 | 76 ms |
  | 46 MiB | 1 | 1 | 73 ms |
  | **64 MiB (chosen)** | **2** | **1** | **157 ms** |

  64 MiB / t=2 / p=1 fits the 100-250 ms target and stays at the memory ceiling (64 MiB). The work is synchronous WASM, so one
  instance verifies one password at a time (this also bounds memory); a serverless core slower than this machine may take about
  twice as long. Verification reads the parameters from the stored PHC string, so changing them later does not lock out old hashes.
