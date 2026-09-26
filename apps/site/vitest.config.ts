import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { countDecisionRecords } from './decision-records'
import { coverage } from '../../vitest.coverage'

export default defineConfig({
  plugins: [react()],
  define: { __DECISION_RECORDS__: countDecisionRecords() },
  test: {
    coverage,
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    passWithNoTests: true,
  },
})
