import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { countDecisionRecords, countFieldTypes, packageVersion } from './decision-records'
import { coverage } from '../../vitest.coverage'

export default defineConfig({
  plugins: [react()],
  define: {
    __DECISION_RECORDS__: countDecisionRecords(),
    __FIELD_TYPES__: countFieldTypes(),
    __PACKAGE_VERSION__: JSON.stringify(packageVersion()),
  },
  test: {
    coverage,
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    passWithNoTests: true,
    // `userEvent` types one character at a time, and every keystroke here runs the
    // engine and re-renders a real form through a real theme. The hero's form grew a
    // two-column arrangement and three more fields, and the default five seconds then
    // expired on a CI runner while passing locally -- a timeout that depends on whose
    // machine it is tells you nothing about the code.
    testTimeout: 20_000,
  },
})
