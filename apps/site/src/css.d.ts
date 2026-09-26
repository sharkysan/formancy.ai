/// <reference types="vite/client" />
// Vite's own types, for two things this app leans on: side-effect CSS
// imports, which carry no types of their own, and `import.meta.env.DEV` —
// which is how the playground link knows whether the two apps are one
// origin or two dev servers.

/** The number of decision records, counted at build time (see decision-records.ts). */
declare const __DECISION_RECORDS__: number
