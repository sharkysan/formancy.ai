import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core'
import { fieldUploads } from '@formancy/core'
import type { PendingUpload } from '@formancy/core'
import { FormancyTextPipe, injectFormText } from '../text.js'
import { injectUploader } from '../uploads.js'
import type { StoredFile } from '../uploads.js'
import { FieldComponentBase, FormancyFieldShell } from './field-shell.js'
import { FormancyFileThumbnail } from './file-thumbnail.js'


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
 *
 * **Each file is its own upload** — waiting, sending with how far it has got,
 * cancellable, and refused with a reason and a way to try again. What happens to
 * each is `@formancy/core`'s upload queue, which the React binding reads too
 * ([0130](../../../../docs/decisions/0130-each-file-is-its-own-upload.md)); this
 * draws it.
 */
@Component({
  selector: 'formancy-file-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormancyFieldShell, FormancyFileThumbnail, FormancyTextPipe],
  template: `
    <formancy-field-shell [field]="field" [label]="context.label" [path]="context.path">
      @if (upload === null) {
        <p data-formancy-part="file-unavailable">{{ 'file.unavailable' | formancyText }}</p>
      } @else {
        <!--
          The picker inside a drop target, not instead of one.

          Dropping is a pointer gesture with no keyboard equivalent, so it can
          only ever be a SECOND route (WCAG 2.1.1). The input stays exactly as it
          was and keeps the field's label and ARIA wiring; the region around it
          accepts a drop and hands the files to the same function. Two routes,
          one implementation, the same as the React binding.

          Open while files upload: a second file joins the queue rather than
          waiting for the first to be remembered before it can be picked.
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
            [disabled]="field.snapshot().disabled"
            (change)="pick($event)"
          />
        </div>
      }

      @if (files().length > 0 || pending().length > 0 || removed().length > 0) {
        <ul data-formancy-part="file-list">
          @for (file of files(); track file.id; let index = $index, count = $count) {
            <li data-formancy-part="file-item">
              <formancy-file-thumbnail [source]="sourceOf(file.id)" />
              <span data-formancy-part="file-name">{{ file.name }}</span>
              <!-- Absent at the ends rather than disabled, as a repeater row's are: a
                   disabled button still announces a control that does nothing. The
                   position is in the name, so nobody counts rows before pressing. -->
              @if (index > 0) {
                <button
                  type="button"
                  data-formancy-part="file-up"
                  [disabled]="field.snapshot().disabled"
                  (click)="move(index, index - 1)"
                >
                  {{ 'file.up' | formancyText: { name: file.name, position: index + 1, count } }}
                </button>
              }
              @if (index < count - 1) {
                <button
                  type="button"
                  data-formancy-part="file-down"
                  [disabled]="field.snapshot().disabled"
                  (click)="move(index, index + 1)"
                >
                  {{ 'file.down' | formancyText: { name: file.name, position: index + 1, count } }}
                </button>
              }
              <button
                type="button"
                [disabled]="field.snapshot().disabled"
                (click)="remove(file.id)"
              >
                <!-- Named with the file, so a screen reader user hears which
                     attachment a button removes rather than "remove" six
                     times over. -->
                {{ 'file.remove' | formancyText: { name: file.name } }}
              </button>
            </li>
          }

          @for (entry of pending(); track entry.key) {
            <li data-formancy-part="file-item" [attr.data-state]="entry.state">
              <span data-formancy-part="file-name">{{ entry.name }}</span>
              @switch (entry.state) {
                @case ('waiting') {
                  <span data-formancy-part="file-waiting">{{ 'file.waiting' | formancyText }}</span>
                }
                @case ('uploading') {
                  <!-- Without a figure the bar is indeterminate, which is the truth
                       about an uploader that cannot measure. -->
                  <progress
                    data-formancy-part="file-progress"
                    [attr.aria-label]="'file.uploading' | formancyText: { name: entry.name }"
                    [attr.value]="entry.total === undefined ? null : entry.sent"
                    [attr.max]="entry.total === undefined ? null : entry.total"
                  ></progress>
                }
                @case ('failed') {
                  <span data-formancy-part="file-error">{{ 'file.notAttached' | formancyText: { reason: entry.reason ?? '' } }}</span>
                  <button
                    type="button"
                    [disabled]="field.snapshot().disabled"
                    (click)="queue.retry(entry.key)"
                  >
                    {{ 'file.retry' | formancyText: { name: entry.name } }}
                  </button>
                }
              }
              <button
                type="button"
                [disabled]="field.snapshot().disabled"
                (click)="queue.cancel(entry.key)"
              >
                {{ (entry.state === 'failed' ? 'file.dismiss' : 'file.cancel') | formancyText: { name: entry.name } }}
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
              <span data-formancy-part="file-name">{{ entry.file.name }}</span>
              <button
                type="button"
                [disabled]="field.snapshot().disabled"
                (click)="undo(entry.file.id)"
              >
                {{ 'file.undo' | formancyText: { name: entry.file.name } }}
              </button>
            </li>
          }
        </ul>
      }

      <!-- One polite region per field for the uploads themselves: the form's error
           region belongs to validation, and a failed upload is not one. -->
      <p role="status" data-formancy-part="file-status">{{ status() }}</p>
    </formancy-field-shell>
  `,
})
export class FormancyFileField extends FieldComponentBase {
  protected readonly upload = injectUploader()
  /**
   * The form's uploads for this field, found by the row it is drawn for: this
   * component is recreated whenever its row moves, and the uploads survive that.
   */
  private readonly uploads = fieldUploads<File, StoredFile>(this.engine, this.context.path)
  protected readonly queue = this.uploads.queue
  protected readonly pending = signal<readonly PendingUpload[]>(this.queue.pending())
  protected readonly over = signal(false)
  /** Attachments taken out of the answer but not yet forgotten, with where
   *  they came from so undoing restores the order as well as the file. */
  protected readonly removed = signal<ReadonlyArray<{ at: number; file: StoredFile }>>([])

  protected readonly files = computed<readonly StoredFile[]>(() => {
    const value = this.field.snapshot().value
    return Array.isArray(value) ? (value as StoredFile[]) : []
  })

  private readonly words = injectFormText()

  /** The file being sent, or the files refused, by name — in the form's language (0171). */
  protected readonly status = computed(() => {
    const pending = this.pending()
    const sending = pending.find((entry) => entry.state === 'uploading')
    if (sending !== undefined) return this.words('file.status.uploading', { name: sending.name })
    const failed = pending.filter((entry) => entry.state === 'failed')
    if (failed.length === 1) {
      return this.words('file.status.failed', { name: failed[0]!.name, reason: failed[0]!.reason ?? '' })
    }
    if (failed.length > 1) {
      // Joined as the language joins a list: "a.pdf, b.pdf and c.pdf", "a.pdf, b.pdf und c.pdf".
      const names = this.words.list(failed.map((entry) => entry.name))
      return this.words('file.status.failedSeveral', { count: failed.length, names })
    }
    return ''
  })

  constructor() {
    super()
    const unsubscribe = this.queue.subscribe(() => this.pending.set(this.queue.pending()))
    inject(DestroyRef).onDestroy(unsubscribe)
    // This control supplies only the sending: the host's uploader, given an
    // AbortSignal for the queue's cancel, which @formancy/core has no type for.
    const upload = this.upload
    this.uploads.sender =
      upload === null
        ? undefined
        : (file, attempt, field) => {
            const controller = new AbortController()
            attempt.onCancel(() => controller.abort())
            return upload(file, {
              field,
              signal: controller.signal,
              onProgress: (sent, total) => attempt.progress(sent, total),
            })
          }
  }

  protected sourceOf(id: string): File | undefined {
    return this.queue.sourceOf(id)
  }

  protected onDragOver(event: DragEvent): void {
    // Without preventDefault the browser navigates to the file instead of
    // letting the page have it, which looks like the form vanishing.
    event.preventDefault()
    if (this.field.snapshot().disabled) return
    this.over.set(true)
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault()
    this.over.set(false)
    if (this.field.snapshot().disabled || this.upload === null) return
    const dropped = event.dataTransfer?.files
    if (dropped === undefined || dropped.length === 0) return
    this.queue.add(Array.from(dropped))
  }

  protected pick(event: Event): void {
    const input = event.target as HTMLInputElement
    const picked = input.files
    if (picked === null || picked.length === 0 || this.upload === null) return
    this.queue.add(Array.from(picked))
    input.value = ''
  }

  protected move(from: number, to: number): void {
    const next = [...this.files()]
    next.splice(to, 0, ...next.splice(from, 1))
    this.field.setValue(next)
  }

  protected undo(id: string): void {
    const entry = this.removed().find((other) => other.file.id === id)
    if (entry === undefined) return
    this.removed.update((before) => before.filter((other) => other.file.id !== id))
    const next = [...this.files()]
    next.splice(Math.min(entry.at, next.length), 0, entry.file)
    this.field.setValue(next)
  }

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
}
