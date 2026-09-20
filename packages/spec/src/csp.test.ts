import { describe, expect, test } from 'vitest'
import schemaDocument from '../formancy.schema.json' with { type: 'json' }
import generatedSource from './generated/document-validator.js?raw'
import { schemaHash } from './hash.js'
import { validateSchema } from './validate.js'

describe('the validator under a strict CSP', () => {
  // "Runs under script-src 'self' with no unsafe-eval" is a documented product
  // headline, and the builder — the one consumer that must call
  // validateSchema — runs in the browser. ajv's runtime compile() reaches
  // new Function on the first call, so the validator must be PRE-compiled.
  test('the shipped validator source contains no runtime code generation', () => {
    expect(generatedSource).not.toMatch(/new Function/)
    expect(generatedSource).not.toMatch(/\beval\s*\(/)
  })

  test('the committed validator is in sync with formancy.schema.json', () => {
    // The generator stamps the canonical hash of the schema it compiled from.
    // If the schema changes without regeneration, this hash no longer matches.
    expect(generatedSource).toContain(`schema-hash: ${schemaHash(schemaDocument)}`)
  })

  test('no CommonJS require survives in the shipped validator', () => {
    // A require inside the ESM output makes bundlers inject a node:module
    // shim, which is dead code in the browser the builder runs in.
    expect(generatedSource).not.toMatch(/require\(/)
  })

  test('validateSchema still behaves identically through the precompiled path', () => {
    expect(
      validateSchema({
        specVersion: '1',
        id: 'f',
        title: 'T',
        model: { fields: [{ key: 'email', type: 'text' }] },
      }).valid,
    ).toBe(true)
    expect(validateSchema({ nonsense: true }).valid).toBe(false)
  })
})
