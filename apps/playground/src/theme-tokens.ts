/**
 * What a theme can be asked to change, discovered rather than listed.
 *
 * The four shipped themes **do not share a token vocabulary**, deliberately:
 * they are different design languages rather than palette swaps, which is what
 * falsifies the headless claim
 * ([§8.7](../../../docs/architecture/08-crosscutting-concepts.md)). `blueprint`
 * has `--fm-ink`, `--fm-paper`, `--fm-chrome`, `--fm-rule`; `dusk` has
 * `--fm-ground`, `--fm-raised`, `--fm-inset`, `--fm-edge`; `pop` has
 * `--fm-yellow`, `--fm-pink`, `--fm-lift`. Five names are common to all four.
 *
 * So an editor with a fixed set of controls could not edit them, and giving them
 * one would mean flattening the property that makes them worth shipping. This
 * reads what each theme declares instead, which also means **it works for a
 * theme somebody else wrote** with no registration step — the thing a fixed list
 * cannot do at all.
 *
 * Split into a pure half and a thin DOM adapter, for the reason `arrange.ts` is
 * DOM-free in the builder: which declarations count is an argument, and an
 * argument tested through a stylesheet is tested through a CSS parser.
 */

/** One rule, reduced to what matters here. */
export interface ThemeRule {
  readonly selectorText: string
  readonly declarations: ReadonlyArray<readonly [string, string]>
}

/**
 * A theme's own selector and nothing narrower.
 *
 * The discriminator, and it was measured rather than guessed. `blueprint`
 * declares fourteen `--fm-*` properties in Chromium; two are `--fm-columns` and
 * `--fm-datagrid-count`, set on `[data-columns='3']` so a layout can read its
 * own column count. Offering those in an editor would be offering to break the
 * grid. A list of names to exclude would need maintaining by whoever added the
 * next one; the shape of the selector does not.
 */
const THEME_ROOT = /^\[data-formancy-theme=['"]?([A-Za-z0-9_-]+)['"]?\]$/

/** Everything a theme declares on its own root, by theme. */
export function themeTokens(rules: ReadonlyArray<ThemeRule>): Map<string, Record<string, string>> {
  const found = new Map<string, Record<string, string>>()

  for (const { selectorText, declarations } of rules) {
    // Every selector on the rule has to be a theme root. A rule reading
    // `[data-formancy-theme='a'], [data-formancy-theme='a'] [data-formancy-part='field']`
    // declares its properties for both, so taking the first match would
    // attribute a scoped declaration to the theme.
    const selectors = selectorText.split(',').map((selector) => selector.trim())
    const themes = selectors
      .map((selector) => THEME_ROOT.exec(selector)?.[1])
      .filter((theme): theme is string => theme !== undefined)
    if (themes.length !== selectors.length) continue

    for (const theme of themes) {
      const tokens = found.get(theme) ?? {}
      for (const [property, value] of declarations) {
        // A theme may set anything on its own root; `--brand-spacing` belongs to
        // whoever wrote it. Later wins, because that is what the cascade does —
        // `dusk` declares `--fm-control` twice and reading the first would open
        // the editor showing a value the page is not using.
        if (property.startsWith('--fm-')) tokens[property] = value.trim()
      }
      found.set(theme, tokens)
    }
  }

  return found
}

/** What kind of control a value asks for. */
export type TokenKind = 'colour' | 'length' | 'number' | 'text'

/** A hex, an `rgb()`, an `oklch()` — the spellings CSS actually writes a colour in. */
const COLOUR = /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color)\()/i
const LENGTH = /^-?\d*\.?\d+(px|rem|em|%|ch|vw|vh|vmin|vmax)$/
const NUMBER = /^-?\d*\.?\d+$/

/**
 * Which control a token gets, from the shape of its value.
 *
 * `text` is the honest answer for a font stack, a border shorthand or a shadow.
 * A picker that could express only part of such a value would destroy the rest
 * of it the first time somebody touched it, and a `box-shadow` editor is a
 * different product.
 *
 * A bare number is **not** a length: `--fm-columns` is a count, and appending
 * `px` to it produces a grid template that silently computes nothing.
 */
export function classify(value: string): TokenKind {
  const trimmed = value.trim()
  if (COLOUR.test(trimmed)) return 'colour'
  if (LENGTH.test(trimmed)) return 'length'
  if (NUMBER.test(trimmed)) return 'number'
  return 'text'
}

/**
 * The typed values that are actually an override — for the patch and the count.
 *
 * **A blank is kept in the editor's map and counts for nothing here**, which is
 * the difference between a field somebody is in the middle of clearing and a
 * token they have decided not to change. Dropping the key on the first empty
 * keystroke made the control fall straight back to the theme's value, so
 * clearing a field and retyping appended to it: `#17222e` became
 * `#17222e#ff0000`. Found by a test doing exactly what a person does.
 *
 * **Not used on the way to the element, and that is measured rather than
 * assumed.** CSSOM discards a whitespace-only custom-property value and trims a
 * padded one by itself, so filtering before setting the style was a branch
 * nothing reached — a mutation run left the suite green without it. The call is
 * gone from `app.tsx`; what stays is this, where `exportCss` and the changed
 * count both depend on it and both have cases that fail without it.
 */
export function applied(overrides: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(overrides)
      .map(([token, value]) => [token, value.trim()] as const)
      .filter(([, value]) => value !== ''),
  )
}

/**
 * The overrides as a CSS rule, or nothing when there are none.
 *
 * **Only what was changed.** A full dump would be a fork: paste it into a
 * project and the next release of `@formancy/themes` changes nothing, because
 * every value is pinned. This emits a patch that keeps inheriting.
 *
 * Sorted, because a diff that reorders on every save is a diff nobody reads.
 */
export function exportCss(theme: string, overrides: Readonly<Record<string, string>>): string {
  const entries = Object.entries(applied(overrides)).sort(([a], [b]) => a.localeCompare(b))
  if (entries.length === 0) return ''

  const body = entries.map(([token, value]) => `  ${token}: ${value};`).join('\n')
  return `[data-formancy-theme='${theme}'] {\n${body}\n}\n`
}

/** What a preset holds for the theme on screen, and what in it will not be read. */
export interface PresetReading {
  /** The tokens it sets that this theme declares: what the editor applies. */
  readonly overrides: Record<string, string>
  /** Tokens it sets for this theme that the theme does not declare, so they would set nothing. */
  readonly undeclared: readonly string[]
  /** Other themes it has tokens for, which belong to those themes and not to this one. */
  readonly otherThemes: readonly string[]
  /** Selectors carrying a formancy token that are not a theme's own — `:root`, say. */
  readonly elsewhere: readonly string[]
}

/**
 * A preset read back: the patch `exportCss` writes, or one written by hand.
 *
 * **A preset is the patch and nothing else** — no second format to keep in step
 * with the first, and nothing in it a person cannot read
 * ([0124](../../../docs/decisions/0124-a-theme-preset-is-the-patch-read-back.md)).
 * Read through the same rule the editor discovers tokens by, so a preset can set
 * exactly what the editor offers and no more: a token the theme does not declare
 * would set a property nothing reads, and one declared on `:root` would be
 * overridden by the theme's own root before it reached a control. Both are reported
 * rather than dropped — a preset that half applies and says nothing reads as one that
 * worked.
 */
export function readPreset(
  rules: ReadonlyArray<ThemeRule>,
  theme: string,
  declared: Readonly<Record<string, string>>,
): PresetReading {
  const byTheme = themeTokens(rules)
  const forTheme = byTheme.get(theme) ?? {}

  const elsewhere = rules
    .filter(({ selectorText, declarations }) => {
      const roots = selectorText.split(',').map((selector) => THEME_ROOT.test(selector.trim()))
      return (
        !roots.every(Boolean) && declarations.some(([property]) => property.startsWith('--fm-'))
      )
    })
    .map(({ selectorText }) => selectorText)

  return {
    overrides: Object.fromEntries(Object.entries(forTheme).filter(([token]) => token in declared)),
    undeclared: Object.keys(forTheme).filter((token) => !(token in declared)),
    otherThemes: [...byTheme.keys()].filter((other) => other !== theme),
    elsewhere: [...new Set(elsewhere)],
  }
}

/** What reading a preset did, as one paragraph a person can act on. */
export function describePreset(file: string, theme: string, reading: PresetReading): string {
  const count = Object.keys(reading.overrides).length
  const sentences = [
    count === 0
      ? `Nothing in ${file} is a token ${theme} declares, so nothing changed.`
      : `Read ${String(count)} ${count === 1 ? 'token' : 'tokens'} for ${theme} from ${file}.`,
  ]
  if (reading.undeclared.length > 0) {
    sentences.push(`Not read: ${reading.undeclared.join(', ')}, which ${theme} does not declare.`)
  }
  if (reading.otherThemes.length > 0) {
    sentences.push(
      `It also has tokens for ${reading.otherThemes.join(', ')}: choose that theme and import it again.`,
    )
  }
  if (reading.elsewhere.length > 0) {
    sentences.push(
      `Not read: what it declares on ${reading.elsewhere.join(', ')}, which is not a theme's own selector and would not reach a themed form.`,
    )
  }
  return sentences.join(' ')
}

/**
 * A stylesheet's text as rules, parsed by the browser.
 *
 * A constructed stylesheet rather than a pattern here, so a preset is read by the
 * parser that will apply it — comments, escapes and all — and handed to the same
 * adapter the live stylesheets go through.
 */
export function rulesOfText(text: string): ThemeRule[] {
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(text)
  return declarationsOf([sheet])
}

/**
 * Every style rule in a set of stylesheets, reduced to `ThemeRule`.
 *
 * **Cross-origin stylesheets throw on `cssRules` and are stepped over.**
 * The playground loaded two until 2026-10-09 — Google Fonts — and serves its own
 * faces now (0154), but a host's page taking a webfont from a font service still
 * does. An adapter that did not expect it would take the whole editor down, and it
 * would be empty on exactly the pages that load a webfont that way.
 *
 * Grouping rules are recursed into. No shipped theme declares a token inside
 * `@media`, but a consumer's dark-mode theme would, and an editor that silently
 * showed nothing for it is a worse failure than one that lists a token whose
 * query does not currently match — especially since the value shown comes from
 * `resolve` rather than from here.
 */
export function declarationsOf(sheets: Iterable<CSSStyleSheet>): ThemeRule[] {
  const out: ThemeRule[] = []

  const visit = (rules: CSSRuleList): void => {
    for (const rule of rules) {
      const any = rule as CSSRule & {
        selectorText?: string
        style?: CSSStyleDeclaration
        cssRules?: CSSRuleList
      }

      /*
       * A style rule is recognised by having a selector, **not** by lacking
       * nested rules. The first version of this recursed whenever `cssRules`
       * was defined and collected nothing at all, because jsdom's
       * `CSSStyleRule` exposes an empty `cssRules` list of its own — so every
       * rule looked like an `@media`. The two adapter cases caught it, which is
       * the whole reason they hand in a real stylesheet rather than a fake.
       *
       * `@font-face` and `@import` have no `selectorText`, and reading one off
       * them gives `undefined` — which would match nothing and drop the theme
       * that happened to sit after them.
       */
      if (any.selectorText !== undefined && any.style !== undefined) {
        const style = any.style
        out.push({
          selectorText: any.selectorText,
          declarations: [...style].map((property) => [property, style.getPropertyValue(property)]),
        })
      }

      // Recursed into either way: an `@media` holds the rules it wraps, and a
      // style rule may hold nested ones that declare tokens of their own.
      if (any.cssRules !== undefined && any.cssRules.length > 0) visit(any.cssRules)
    }
  }

  for (const sheet of sheets) {
    try {
      visit(sheet.cssRules)
    } catch {
      // Cross-origin. Nothing to do and nothing worth saying: a theme cannot be
      // served from another origin and still be editable here.
      continue
    }
  }

  return out
}

/**
 * What each token currently resolves to on `host`.
 *
 * **The declared value and the effective value are different questions**, and
 * this is the one the editor has to open with. CSSOM can enumerate names and
 * says what a rule *declares*; `getComputedStyle` says what the browser
 * actually resolved — through the cascade, through whichever media queries match
 * and through any override already applied. Opening a control at the declared
 * value would show a number the page is not using the moment a theme has two
 * declarations for one token, which `dusk` does.
 */
export function resolve(host: Element, tokens: ReadonlyArray<string>): Record<string, string> {
  const computed = getComputedStyle(host)
  return Object.fromEntries(tokens.map((token) => [token, computed.getPropertyValue(token).trim()]))
}
