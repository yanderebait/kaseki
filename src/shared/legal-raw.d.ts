// The authoritative legal text is imported as a raw string via Vite's `?raw`
// suffix (see electron.vite.config.ts's `@legal` alias). A specific module
// declaration — rather than a `*?raw` wildcard — avoids colliding with the
// wildcard that vite/client already provides to the renderer build, while
// still giving the main-process build (which has no vite/client types) a type
// for this one import.
declare module '@legal/policies.md?raw' {
  const content: string
  export default content
}
