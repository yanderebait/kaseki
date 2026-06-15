import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// `@legal` resolves to the project-root `legal/` directory so both the main
// process and the renderer can `import '@legal/policies.md?raw'` and bake the
// authoritative legal text in at build time (single source, no packaging
// path). The renderer root is src/renderer, so the alias also keeps the
// import from reaching outside it with a long relative path; fs.allow lets the
// dev server read the file from the project root.
const legalAlias = { '@legal': resolve(__dirname, 'legal') }

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: legalAlias }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: { alias: legalAlias },
    plugins: [react()],
    server: { fs: { allow: [resolve(__dirname)] } }
  }
})
