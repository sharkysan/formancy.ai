import { describe, expect, test } from 'vitest'
import * as barrel from './index.js'
import * as authoring from './authoring.js'

/**
 * What an author's tools run and no form does leaves the engine's barrel (0217): checking a
 * document's expressions, finding the paths its rules read that no field provides, and running
 * its examples. Every form loads the barrel, which is held to 18 kB (§9.3), and these were 2.6 kB
 * of it that a form never calls. They are `@formancy/core/authoring`, as a summary of responses
 * is `@formancy/core/summary` (0206).
 */
const AUTHORING = ['expressionProblems', 'MIXED_NUMERIC_LITERAL_EXAMPLE', 'runScenarios', 'unknownReferences'] as const

describe('what only an author’s tools run', () => {
  test('is not in the engine’s barrel, which every form loads', () => {
    expect(AUTHORING.filter((name) => name in barrel)).toEqual([])
  })

  test('is in `@formancy/core/authoring`', () => {
    expect(AUTHORING.filter((name) => !(name in authoring))).toEqual([])
  })
})
