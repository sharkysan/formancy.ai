import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core'
import { injectUploader } from '../uploads.js'
import type { StoredFile } from '../uploads.js'
import { FieldComponentBase, FormancyFieldShell } from './field-shell.js'


/**
 * The file control, over an uploader the host supplies.
 *
 * One file per control, because a control changes for its own reasons.
 * These were one 1,909-line file — the second largest in the repository,
 * and the place things went.
 */
/**
 * Attached files.
 *
 * The control picks files; an injected uploader puts them somewhere and
 * reports what was stored. Without one the field is read-only and says so,
 * rather than accepting a file it has nowhere to put.
 */
@Component({
  selector: 'formancy-file-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyFieldShell],
  template: `
    <formancy-field-shell [field]="field" [label]="context.label" [path]="context.path">
      @if (upload === null) {
        <p data-formancy-part="file-unavailable">
          This form cannot accept files here, because no upload destination has been configured.
        </p>
      } @else {
        <!--
          The picker inside a drop target, not instead of one.

          Dropping is a pointer gesture with no keyboard equivalent, so it can
          only ever be a SECOND route (WCAG 2.1.1). The input stays exactly as it
          was and keeps the field's label and ARIA wiring; the region around it
          accepts a drop and hands the files to the same function. Two routes,
          one implementation, the same as the React binding.
        -->
        <div
          data-formancy-part="file-dropzone"
          [attr.data-state]="over() ? 'over' : null"
          (dragover)="onDragOver($event)"
          (dragleave)="over.set(false)"
          (drop)="onDrop($event)"
        >
          <input
            type="file"
            [id]="control().id"
            [attr.name]="control().name"
            [attr.aria-describedby]="control()['aria-describedby']"
            [attr.accept]="acceptAttribute()"
            [attr.multiple]="multiple() ? '' : null"
            [disabled]="field.snapshot().disabled || busy()"
            (change)="pick($event)"
          />
        </div>
      }

      @if (files().length > 0 || removed().length > 0) {
        <ul data-formancy-part="file-list">
          @for (file of files(); track file.id) {
            <li data-formancy-part="file-item">
              <span>{{ file.name }}</span>
              <button
                type="button"
                [disabled]="field.snapshot().disabled"
                (click)="remove(file.id)"
              >
                <!-- Named with the file, so a screen reader user hears which
                     attachment a button removes rather than "remove" six
                     times over. -->
                Remove {{ file.name }}
              </button>
            </li>
          }

          <!--
            A removed attachment stays visible with a way back. The bytes are
            still in storage until the unclaimed collector runs, so the removal
            is recoverable for free, and a misclick on the wrong row of six is
            the ordinary way somebody loses the evidence they came to attach.
          -->
          @for (entry of removed(); track entry.file.id) {
            <li data-formancy-part="file-item" data-state="removed">
              <span>{{ entry.file.name }}</span>
              <button
                type="button"
                [disabled]="field.snapshot().disabled"
                (click)="undo(entry.file.id)"
              >
                Undo removing {{ entry.file.name }}
              </button>
            </li>
          }
        </ul>
      }

      <!-- One polite region per field for the upload itself: the form's error
           region belongs to validation, and a failed upload is not one. -->
      <p role="status" data-formancy-part="file-status">{{ status() }}</p>
    </formancy-field-shell>
  `,
})
export class FormancyFileField extends FieldComponentBase {
  protected readonly upload = injectUploader()
  protected readonly over = signal(false)
  /** Attachments taken out of the answer but not yet forgotten, with where
   *  they came from so undoing restores the order as well as the file. */
  protected readonly removed = signal<ReadonlyArray<{ at: number; file: StoredFile }>>([])

  protected onDragOver(event: DragEvent): void {
    // Without preventDefault the browser navigates to the file instead of
    // letting the page have it, which looks like the form vanishing.
    event.preventDefault()
    if (this.field.snapshot().disabled || this.busy()) return
    this.over.set(true)
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault()
    this.over.set(false)
    if (this.field.snapshot().disabled || this.busy()) return
    const dropped = event.dataTransfer?.files
    if (dropped === undefined || dropped.length === 0) return
    void this.store(Array.from(dropped))
  }

  protected undo(id: string): void {
    const entry = this.removed().find((other) => other.file.id === id)
    if (entry === undefined) return
    this.removed.update((before) => before.filter((other) => other.file.id !== id))
    const next = [...this.files()]
    next.splice(Math.min(entry.at, next.length), 0, entry.file)
    this.field.setValue(next)
  }
  protected readonly busy = signal(false)
  protected readonly failure = signal<string | undefined>(undefined)

  protected readonly files = computed<readonly StoredFile[]>(() => {
    const value = this.field.snapshot().value
    return Array.isArray(value) ? (value as StoredFile[]) : []
  })

  protected readonly status = computed(() => (this.busy() ? 'Uploading…' : (this.failure() ?? '')))

  protected acceptAttribute(): string | null {
    const accept = this.field.snapshot().def.accept
    return accept === undefined || accept.length === 0 ? null : accept.join(',')
  }

  protected multiple(): boolean {
    const max = this.field.snapshot().def.maxItems
    return max === undefined || max > 1
  }

  protected remove(id: string): void {
    const at = this.files().findIndex((file) => file.id === id)
    const going = this.files()[at]
    if (going === undefined) return
    // Out of the answer immediately, so a submit in between is correct, and
    // remembered with its position so undoing puts it BACK where it was rather
    // than on the end — the order matters to somebody who numbered their
    // attachments in a covering note.
    this.removed.update((before) => [...before, { at, file: going }])
    this.field.setValue(this.files().filter((file) => file.id !== id))
  }

  protected pick(event: Event): void {
    const input = event.target as HTMLInputElement
    const picked = input.files
    if (picked === null || picked.length === 0 || this.upload === null) return
    void this.store(Array.from(picked)).finally(() => {
      input.value = ''
    })
  }

  private async store(picked: readonly File[]): Promise<void> {
    this.busy.set(true)
    this.failure.set(undefined)

    // Each file succeeds or fails on its own.
    //
    // The first version collected them into an array and set the value once, so
    // a throw on the third of five discarded the two that had ALREADY uploaded:
    // their bytes were in storage, the submission never mentioned them, the
    // collector reclaimed them within the day, and the person was told the
    // upload failed when half of it had not. Whose fault the failure is does not
    // change who loses the file. The React binding does exactly the same thing.
    const uploaded: StoredFile[] = []
    const refused: string[] = []

    for (const file of picked) {
      try {
        uploaded.push(await this.upload!(file))
      } catch (error) {
        refused.push(`${file.name} (${error instanceof Error ? error.message : String(error)})`)
      }
    }

    // Recorded before the failure is reported, so nothing that reached storage
    // is left unclaimed while somebody reads the message.
    if (uploaded.length > 0) this.field.setValue([...this.files(), ...uploaded])

    if (refused.length > 0) {
      // Named, because "the upload failed" over a list of five attachments does
      // not say which one to try again.
      this.failure.set(
        refused.length === 1
          ? `${refused[0]!} was not attached.`
          : `${String(refused.length)} files were not attached: ${refused.join(', ')}.`,
      )
    }

    this.busy.set(false)
    this.field.touch()
  }
}
