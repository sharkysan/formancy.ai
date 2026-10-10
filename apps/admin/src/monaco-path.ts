/**
 * Where the admin serves Monaco's AMD build from, under its own base (0154).
 *
 * One constant in a module of its own because two programs have to agree on it:
 * `vite.config.ts`, which writes the copy into the build and serves it in development,
 * and `main.tsx`, which points the loader at it — as the playground does.
 */
export const MONACO_VS = 'monaco/vs'
