<!-- Part of formancy: https://github.com/sharkysan/formancy.ai -->

# @formancy/themes

Four reference themes. CSS only — no JavaScript, no build step, no dependency
on any renderer.

## What they are for

The renderers ship **zero CSS**. That claim is easy to make and hard to trust,
so these files exist to test it: the same markup and the same engine, dressed
as four products that do not look related.

| | Blueprint | Dusk | Pop | Paper |
| --- | --- | --- | --- | --- |
| Feels like | a technical drawing | a dark app | a sticker sheet | a printed page |
| Ground | white | dark | cream or white | paper or white |
| Controls | boxes, 3px corners | inset wells, 10px corners | outlined, hard shadow | a line to write on |
| Type | IBM Plex Sans | Space Grotesk | Archivo, heavy | Fraunces, spaced small capitals for labels |
| Choices | drawn boxes and circles | lit wells | chips | hairline boxes, italic when chosen |
| Invalid shown as | a bar on the leading edge | a ring around the control | a pink sticker | a vermilion line and an italic note |
| Required shown as | an asterisk | the word "required" | a star | a footnote asterisk |
| Active wizard step | a numbered, underlined word | a lit dot on a track | a yellow badge | a roman numeral, underlined |

If supporting any of them had required changing a component, the headless
claim would be false. None did.

## Use

```ts
import '@formancy/themes/blueprint.css'
import '@formancy/themes/dusk.css'
import '@formancy/themes/pop.css'
import '@formancy/themes/paper.css'
```

```html
<div data-formancy-theme="blueprint">…your form…</div>
```

Every file is scoped under `[data-formancy-theme]`, so a page can load all of
them and switch by changing one attribute — which is what the playground and
the landing page do.

Each theme sets its own text colour, colour scheme and `box-sizing` on its
subtree, so it does not depend on the host page's reset. It does not paint the
page behind the form: Pop and Paper look best on the ground colour they
declare as `--fm-ground`, and fine on white.

Fonts are referenced, not bundled; the demo apps load them from Google Fonts
and every theme falls back to a system stack.

## Writing your own

Copy one and change it. The whole surface is these attributes:

- fields: `field` (with `data-state="invalid|valid"`), `label`, `error`,
  `required-hint`, `radio-option`, `checkbox-option`, `static`
- repeaters: `repeater`, `repeater-legend`, `row`
- layouts: `layout-row`, `layout-column`, `layout-section`,
  `layout-section-heading`, `layout-table` (with `data-columns`),
  `layout-tabs`, `tablist`, `tab`, `tabpanel`
- wizard and submit: `stepper`, `wizard-nav`, `submit`
- errors: `error-summary`, `error-summary-heading`
- rich text: `richtext-toolbar`, `richtext-button`, `richtext-preview`,
  `richtext`, `visually-hidden`
- files: `file-list`, `file-item`, `file-status`, `file-unavailable`

`visually-hidden` has to be hidden by every theme — it is the only name the
rich text toolbar's buttons have, so it is moved off screen, never removed.

Controls are plain `input`, `select` and `textarea` inside `[data-formancy-part="field"]`.
Nothing is a class, so nothing collides with your design system.
