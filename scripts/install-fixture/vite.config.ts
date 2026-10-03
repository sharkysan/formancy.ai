import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// A consumer's config, with nothing formancy-specific in it. Needing a special
// case here would itself be the finding.
export default defineConfig({ plugins: [react()] })
