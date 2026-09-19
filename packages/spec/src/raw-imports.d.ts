// Vite/vitest's ?raw suffix imports a module's source text. Used by tests that
// assert properties of shipped source (e.g. the CSP guarantee).
declare module '*?raw' {
  const source: string
  export default source
}
