/**
 * A promise nobody awaits, on purpose: what `lint.mjs` lints with the installed
 * `@formancy/code-style`. Only a type-aware rule can report it, so it is reported only
 * when typescript-eslint has read this project's tsconfig with the TypeScript this
 * project installed.
 */
export async function save(): Promise<void> {}

save()
