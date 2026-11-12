// Vitest has no React Server Components build, so the real `server-only` package would throw. Next swaps in its own
// no-op for server builds and a throwing one for client builds; tests run as the server, so this is the no-op.
export {};
