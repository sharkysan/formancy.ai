/**
 * Where the playground serves Monaco's AMD build from, under its own base (0154).
 *
 * One constant in a module of its own because two programs have to agree on it:
 * `vite.config.ts`, which writes the copy into the build and serves it in development,
 * and `main.tsx`, which points the loader at it. Written twice, a rename on one side would
 * leave the editor at "Loading…" with every other gate green — only `pnpm test:browser`
 * would say so.
 */
export const MONACO_VS = 'monaco/vs'
