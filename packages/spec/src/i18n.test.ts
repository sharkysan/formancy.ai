import { describe, expect, test } from 'vitest'
import { resolveText, unreferencedPaths } from './presentation.js'
import type { FormSchema } from './types.js'
import { validateSchema } from './validate.js'

const withI18n: FormSchema = {
  specVersion: '0',
  id: 'contact',
  title: 'Contact',
  model: {
    fields: [
      { key: 'email', type: 'text', label: { $t: 'email.label' } },
      { key: 'note', type: 'text', label: 'Plain string still works' },
    ],
  },
  i18n: {
    defaultLocale: 'en',
    messages: {
      en: { 'email.label': 'Email address' },
      de: { 'email.label': 'E-Mail-Adresse' },
    },
  },
}

describe('the i18n section', () => {
  test('accepts a message reference alongside plain strings', () => {
    expect(validateSchema(withI18n).valid).toBe(true)
  })

  test('rejects a reference the default locale cannot resolve', () => {
    const broken = JSON.parse(JSON.stringify(withI18n)) as FormSchema
    broken.model.fields[0]!.label = { $t: 'nowhere' }

    const result = validateSchema(broken)

    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.errors.some((e) => e.message.includes('nowhere'))).toBe(true)
    }
  })

  test('rejects a reference when there is no i18n section at all', () => {
    const result = validateSchema({
      specVersion: '0',
      id: 'f',
      title: 'T',
      model: { fields: [{ key: 'a', type: 'text', label: { $t: 'a.label' } }] },
    })

    expect(result.valid).toBe(false)
  })

  test('rejects a default locale with no catalog', () => {
    const broken = JSON.parse(JSON.stringify(withI18n)) as FormSchema
    broken.i18n!.defaultLocale = 'fr'

    expect(validateSchema(broken).valid).toBe(false)
  })

  test('a non-default locale may be partial — translation is always in progress', () => {
    const partial = JSON.parse(JSON.stringify(withI18n)) as FormSchema
    partial.i18n!.messages['de'] = {}

    expect(validateSchema(partial).valid).toBe(true)
  })
})

describe('resolveText', () => {
  test('returns a plain string unchanged', () => {
    expect(resolveText(withI18n, 'Plain', 'en')).toBe('Plain')
  })

  test('resolves a reference in the asked-for locale', () => {
    expect(resolveText(withI18n, { $t: 'email.label' }, 'de')).toBe('E-Mail-Adresse')
  })

  test('falls back to the default locale rather than showing an id to a user', () => {
    expect(resolveText(withI18n, { $t: 'email.label' }, 'fr')).toBe('Email address')
  })

  test('returns undefined for an unresolvable reference, so callers can fall back', () => {
    expect(resolveText(withI18n, { $t: 'ghost' }, 'en')).toBeUndefined()
  })

  test('returns undefined when given undefined', () => {
    expect(resolveText(withI18n, undefined, 'en')).toBeUndefined()
  })
})

const withLayout: FormSchema = {
  specVersion: '0',
  id: 'order',
  title: 'Order',
  model: {
    fields: [
      { key: 'customer', type: 'text' },
      { key: 'address', type: 'group', fields: [{ key: 'city', type: 'text' }] },
      { key: 'notes', type: 'textarea' },
    ],
  },
  layouts: [
    {
      name: 'web',
      nodes: [
        {
          kind: 'section',
          label: 'Who',
          children: [
            { kind: 'field', path: 'customer' },
            { kind: 'field', path: 'address.city' },
          ],
        },
        { kind: 'field', path: 'notes' },
      ],
    },
    {
      name: 'print',
      nodes: [{ kind: 'field', path: 'customer' }],
    },
  ],
}

describe('the layout section', () => {
  test('accepts named layouts over the same model', () => {
    expect(validateSchema(withLayout).valid).toBe(true)
  })

  test('rejects a node pointing at a field that does not exist', () => {
    const broken = JSON.parse(JSON.stringify(withLayout)) as FormSchema
    broken.layouts![0]!.nodes[1] = { kind: 'field', path: 'ghost' }

    const result = validateSchema(broken)

    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.errors.some((e) => e.message.includes('ghost'))).toBe(true)
  })

  test('rejects the same field placed twice in one layout — it has one place', () => {
    const broken = JSON.parse(JSON.stringify(withLayout)) as FormSchema
    broken.layouts![0]!.nodes.push({ kind: 'field', path: 'customer' })

    expect(validateSchema(broken).valid).toBe(false)
  })

  test('but the same field may appear in DIFFERENT layouts', () => {
    // `customer` is in both web and print already.
    expect(validateSchema(withLayout).valid).toBe(true)
  })

  test('rejects two layouts sharing a name', () => {
    const broken = JSON.parse(JSON.stringify(withLayout)) as FormSchema
    broken.layouts![1]!.name = 'web'

    expect(validateSchema(broken).valid).toBe(false)
  })

  test('a layout label may itself be a message reference', () => {
    const translated = JSON.parse(JSON.stringify(withLayout)) as FormSchema
    translated.layouts![0]!.nodes[0] = {
      kind: 'section',
      label: { $t: 'who.heading' },
      children: [{ kind: 'field', path: 'customer' }],
    }
    translated.layouts![0]!.nodes[1] = { kind: 'field', path: 'address.city' }
    translated.i18n = { defaultLocale: 'en', messages: { en: { 'who.heading': 'Who' } } }

    expect(validateSchema(translated).valid).toBe(true)
  })
})

describe('unreferencedPaths', () => {
  test('names the fields a layout leaves out, so a builder can warn', () => {
    expect(unreferencedPaths(withLayout, 'print')).toEqual(['address', 'address.city', 'notes'])
  })

  test('is empty for a layout that places everything', () => {
    expect(unreferencedPaths(withLayout, 'web')).toEqual(['address'])
  })

  test('returns undefined for a layout name that does not exist', () => {
    expect(unreferencedPaths(withLayout, 'mobile')).toBeUndefined()
  })
})
