import angular from '@analogjs/vite-plugin-angular'
import { defineConfig } from 'vite'

/** An ordinary Vite + Analog Angular build, run by the linker over the installed packages. */
export default defineConfig({
  plugins: [angular({ tsconfig: './tsconfig.json' })],
  logLevel: 'error',
})
