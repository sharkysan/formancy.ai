/**
 * Which panes there are, how wide each one is, and how to fold one away.
 *
 * Its own file because `app.tsx`'s size budget named the seam as one pane per
 * file, and folding pushed it over: three panes have already left — the Angular
 * renderer, this deployment's capabilities, and the builder.
 *
 * One subject rather than three lists that happen to be adjacent. The narrow
 * screen shows one pane and needs their names; the wide screen shows all three
 * and needs their widths; folding needs both and a control. Splitting them would
 * mean three files that must be edited together, which is worse than the one
 * they came from.
 */

/**
 * The three panes, for a screen too narrow to show them side by side.
 *
 * Stacked, each pane became a 320-pixel box with its own scrollbar inside a
 * page with another one — a form you could see four fields of at a time.
 * Narrow, the page shows one pane at a time at its full height instead, and
 * this chooses which. The form is first because it is what somebody came to
 * see. Wide, all three are shown and the switch is not.
 */
export const PANES = [
  { id: 'form', label: 'Form' },
  { id: 'editor', label: 'Editor' },
  { id: 'engine', label: 'Engine' },
] as const

export type PaneId = (typeof PANES)[number]['id']

/**
 * The grid column each pane gets when it is open, in the order they appear.
 *
 * Here rather than in the stylesheet because the template depends on which
 * panes are folded, and three panes is eight combinations — eight CSS rules
 * that all say the same thing. The widths are still one list in one place; what
 * is computed is only which of them apply. How narrow a folded strip is stays
 * in the stylesheet, as `--pane-folded`.
 */
export const PANE_COLUMNS: ReadonlyArray<readonly [PaneId, string]> = [
  ['editor', 'minmax(19rem, 1fr)'],
  ['form', 'minmax(24rem, 1.25fr)'],
  ['engine', 'minmax(16rem, 0.8fr)'],
]

/**
 * The fold control for one pane.
 *
 * A disclosure: the name says which pane and `aria-expanded` says the state, so
 * a screen reader reads "Engine pane, button, expanded" and the name does not
 * change under somebody mid-sentence. The heading beside it is not the button,
 * because the editor's heading already holds the build/schema switch.
 */
export function FoldPane({
  pane,
  folded,
  onToggle,
}: {
  pane: string
  folded: boolean
  onToggle: () => void
}) {
  return (
    <button
      className="fold"
      aria-label={`${pane} pane`}
      aria-expanded={!folded}
      onClick={onToggle}
      title={folded ? `Open the ${pane.toLowerCase()} pane` : `Fold the ${pane.toLowerCase()} pane away`}
    >
      {/* Decoration: the name and the state are on the button, and a screen
          reader reading "chevron" here would be reading the icon twice. */}
      <span aria-hidden="true">{folded ? '›' : '‹'}</span>
    </button>
  )
}
