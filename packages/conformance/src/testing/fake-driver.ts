import type {
  ConformanceMessage,
  MountOptions,
  RendererDriver,
  SubmitResult,
} from '../driver.js'
import type { ConformanceFieldDef, ConformanceSchema, JsonValue } from '../types.js'

/**
 * TEST-ONLY. Deliberately absent from src/index.ts and therefore from the
 * published API.
 *
 * This is not an engine and must never grow into one: it exists only to prove
 * that the runner reports a pass, reports a failure at the right step index,
 * and distinguishes a driver crash from an assertion failure. If it ever
 * became good enough to run the shipped fixtures, the suite would be measuring
 * this file instead of a renderer, and every published fixture would silently
 * encode this file's opinions.
 *
 * It is not a driver a renderer may copy either: a real driver reaches the form
 * through role and accessible name, and this one holds a plain object.
 */
export interface FakeDriverOptions {
  /** A field is visible only while `values[path]` equals `equals`. */
  readonly visibleWhen?: Readonly<Record<string, { readonly path: string; readonly equals: JsonValue }>>
  /** Driver methods that throw instead of answering, to exercise crash reporting. */
  readonly crashOn?: readonly FakeDriverMethod[]
}

export type FakeDriverMethod =
  | 'mount'
  | 'fill'
  | 'activate'
  | 'visibleFields'
  | 'valueOf'
  | 'errorsFor'
  | 'currentPage'
  | 'ariaSnapshot'
  | 'submit'
  | 'unmount'

export function createFakeDriver(options: FakeDriverOptions = {}): RendererDriver {
  let schema: ConformanceSchema | undefined
  let values: Record<string, JsonValue> = {}
  let messages: ConformanceMessage[] = []
  let pageIndex = 0

  const crashOn = new Set<FakeDriverMethod>(options.crashOn ?? [])

  function guard(method: FakeDriverMethod): void {
    if (crashOn.has(method)) throw new Error(`fake driver exploded in ${method}()`)
  }

  function mounted(): ConformanceSchema {
    if (schema === undefined) throw new Error('fake driver used before mount()')
    return schema
  }

  function pages(): readonly ConformanceFieldDef[] {
    return mounted().model.fields.filter((field) => field.type === 'page')
  }

  function fieldsOnCurrentPage(): readonly ConformanceFieldDef[] {
    const paged = pages()
    if (paged.length === 0) return leaves(mounted().model.fields)
    return leaves(paged[pageIndex]?.fields ?? [])
  }

  function isVisible(field: ConformanceFieldDef): boolean {
    const rule = options.visibleWhen?.[field.key]
    if (rule === undefined) return true
    return values[rule.path] === rule.equals
  }

  function visible(): readonly ConformanceFieldDef[] {
    return fieldsOnCurrentPage().filter(isVisible)
  }

  function validate(fields: readonly ConformanceFieldDef[]): ConformanceMessage[] {
    return fields
      .filter((field) => field.required === true && isEmpty(values[field.key]))
      .map((field) => ({ path: field.key, code: 'required' }))
  }

  return {
    async mount(next: ConformanceSchema, mountOptions?: MountOptions): Promise<void> {
      guard('mount')
      schema = next
      pageIndex = 0
      messages = []
      values = { ...(mountOptions?.initialValues ?? {}) }
      for (const field of leaves(next.model.fields)) {
        if (!(field.key in values)) values[field.key] = field.type === 'checkbox' ? false : ''
      }
    },

    async fill(path: string, value: JsonValue): Promise<void> {
      guard('fill')
      mounted()
      values[path] = value
      messages = messages.filter((message) => message.path !== path)
    },

    async activate(path: string): Promise<void> {
      guard('activate')
      mounted()
      if (path === '#next') {
        const found = validate(visible())
        messages = found
        if (found.length === 0) pageIndex = Math.min(pageIndex + 1, pages().length - 1)
      } else if (path === '#back') {
        pageIndex = Math.max(pageIndex - 1, 0)
      }
    },

    async visibleFields(): Promise<readonly string[]> {
      guard('visibleFields')
      return visible().map((field) => field.key)
    },

    async valueOf(path: string): Promise<JsonValue> {
      guard('valueOf')
      mounted()
      return values[path] ?? null
    },

    async errorsFor(path?: string): Promise<readonly ConformanceMessage[]> {
      guard('errorsFor')
      return path === undefined ? messages : messages.filter((message) => message.path === path)
    },

    async currentPage(): Promise<string | undefined> {
      guard('currentPage')
      return pages()[pageIndex]?.key
    },

    async ariaSnapshot(): Promise<string> {
      guard('ariaSnapshot')
      return visible()
        .map((field) => `- textbox "${field.label ?? field.key}": ${JSON.stringify(values[field.key])}`)
        .join('\n')
    },

    async submit(): Promise<SubmitResult> {
      guard('submit')
      const shown = visible()
      const found = validate(shown)
      messages = found
      if (found.length > 0) return { status: 'rejected', messages: found }

      const data: Record<string, JsonValue> = {}
      for (const field of shown) data[field.key] = values[field.key] ?? null
      return { status: 'accepted', data, messages: [] }
    },

    async unmount(): Promise<void> {
      guard('unmount')
      schema = undefined
    },
  }
}

/** Pages are transparent; this fake knows nothing of groups or repeaters. */
function leaves(fields: readonly ConformanceFieldDef[]): readonly ConformanceFieldDef[] {
  return fields.flatMap((field) => (field.type === 'page' ? leaves(field.fields ?? []) : [field]))
}

function isEmpty(value: JsonValue | undefined): boolean {
  return value === undefined || value === null || value === '' || value === false
}
